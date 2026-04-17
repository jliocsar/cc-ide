import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve as pathResolve, relative, sep } from 'node:path'
import ts from 'typescript'
import { gitLsFiles } from './discovery'
import { langFromPath, TsModuleResolver } from './ts-resolver'
import { filterTsconfigCandidates, TsconfigCascade } from './tsconfig-cascade'
import type {
  EdgeKind,
  GraphDelta,
  GraphEdgeWire,
  GraphNode,
  LanguageParser,
  NodeId,
} from './types'

const TS_EXT_RE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|d\.ts)$/i

interface ParsedImport {
  target: NodeId
  kinds: Set<EdgeKind>
  externalName?: string
  targetLang?: string
}

export class TsParser implements LanguageParser {
  readonly id = 'ts'
  private stopped = false
  private readonly cascade = new TsconfigCascade()
  private readonly resolver = new TsModuleResolver(this.cascade)
  /** workspacePath → relPath → Map<target NodeId, kinds>. Source of truth for diffing. */
  private readonly fileImports = new Map<string, Map<NodeId, Map<NodeId, Set<EdgeKind>>>>()
  /** workspacePath → every known external NodeId we've emitted (for add-once tracking). */
  private readonly knownExternals = new Map<string, Set<NodeId>>()
  /** workspacePath → every known file NodeId we've emitted. */
  private readonly knownFiles = new Map<string, Set<NodeId>>()

  matches(path: string): boolean {
    return TS_EXT_RE.test(path)
  }

  async *scan(workspacePath: string): AsyncGenerator<GraphDelta> {
    this.stopped = false
    this.fileImports.set(workspacePath, new Map())
    this.knownExternals.set(workspacePath, new Set())
    this.knownFiles.set(workspacePath, new Set())

    const allRelPaths = await gitLsFiles(workspacePath)
    const tsconfigRels = filterTsconfigCandidates(allRelPaths)
    await this.cascade.load(workspacePath, tsconfigRels)

    const sources = allRelPaths.filter((p) => this.matches(p))

    const BATCH_SIZE = 50
    let batchNodes: GraphNode[] = []
    let batchEdges: GraphEdgeWire[] = []

    for (let i = 0; i < sources.length; i++) {
      if (this.stopped) return
      const rel = sources[i]!
      const delta = await this.parseOneInto(workspacePath, rel)
      if (!delta) continue
      if (delta.addNodes) batchNodes.push(...delta.addNodes)
      if (delta.addEdges) batchEdges.push(...delta.addEdges)

      if ((i + 1) % BATCH_SIZE === 0 && (batchNodes.length || batchEdges.length)) {
        yield { addNodes: batchNodes, addEdges: batchEdges }
        batchNodes = []
        batchEdges = []
      }
    }

    if (batchNodes.length || batchEdges.length) {
      yield { addNodes: batchNodes, addEdges: batchEdges }
    }
  }

  async onFileChange(absPath: string, workspacePath: string): Promise<GraphDelta | null> {
    if (!this.matches(absPath)) return null
    const nodeId = relPosix(workspacePath, absPath)
    if (!nodeId) return null

    // Deleted file: explicit unlink handling lives in orchestrator; onFileChange
    // is only called when the file still exists. If the read fails, treat as
    // "not a real edit" and skip.
    let content: string
    try {
      content = await fs.readFile(absPath, 'utf8')
    } catch {
      return null
    }

    const { imports, pathRefs, typeRefs, loc } = this.parseFile(absPath, content, workspacePath)
    const imported = await this.resolveImports(imports, absPath, workspacePath)
    const refs = this.resolveRefs(pathRefs, typeRefs, absPath, workspacePath)
    const resolved = mergeParsedImports([...imported, ...refs])

    const perWorkspace = this.ensureFileImports(workspacePath)
    const prev = perWorkspace.get(nodeId) ?? new Map<NodeId, Set<EdgeKind>>()
    const next = new Map<NodeId, Set<EdgeKind>>()
    for (const imp of resolved) next.set(imp.target, imp.kinds)

    const delta: GraphDelta = {}
    const addNodes: GraphNode[] = []
    const addEdges: GraphEdgeWire[] = []
    const removeEdges: { from: NodeId; to: NodeId }[] = []
    const updateEdgeKinds: GraphEdgeWire[] = []

    // Ensure source node exists (file might have been added).
    const knownFiles = this.ensureKnownFiles(workspacePath)
    if (!knownFiles.has(nodeId)) {
      addNodes.push({
        id: nodeId,
        kind: 'file',
        lang: langFromPath(absPath),
        loc,
      })
      knownFiles.add(nodeId)
    }

    for (const imp of resolved) {
      const target = imp.target
      this.ensureTargetNodeKnown(workspacePath, imp, addNodes)
      const prevKinds = prev.get(target)
      if (!prevKinds) {
        addEdges.push({
          from: nodeId,
          to: target,
          kinds: [...imp.kinds].sort(),
        })
      } else if (!setsEqual(prevKinds, imp.kinds)) {
        updateEdgeKinds.push({
          from: nodeId,
          to: target,
          kinds: [...imp.kinds].sort(),
        })
      }
    }
    for (const [target] of prev) {
      if (!next.has(target)) {
        removeEdges.push({ from: nodeId, to: target })
      }
    }

    perWorkspace.set(nodeId, next)

    if (addNodes.length) delta.addNodes = addNodes
    if (addEdges.length) delta.addEdges = addEdges
    if (removeEdges.length) delta.removeEdges = removeEdges
    if (updateEdgeKinds.length) delta.updateEdgeKinds = updateEdgeKinds

    if (!delta.addNodes && !delta.addEdges && !delta.removeEdges && !delta.updateEdgeKinds)
      return null
    return delta
  }

  stop(): void {
    this.stopped = true
  }

  /** Called by orchestrator when a tsconfig file changes. */
  async onTsconfigChange(absTsconfigPath: string): Promise<void> {
    await this.cascade.reload(absTsconfigPath)
  }

  /** Forget all state for a workspace — called on unsubscribe. */
  forgetWorkspace(workspacePath: string): void {
    this.fileImports.delete(workspacePath)
    this.knownExternals.delete(workspacePath)
    this.knownFiles.delete(workspacePath)
  }

  private async parseOneInto(workspacePath: string, rel: string): Promise<GraphDelta | null> {
    const abs = join(workspacePath, rel)
    let content: string
    try {
      content = await fs.readFile(abs, 'utf8')
    } catch {
      return null
    }
    const nodeId = toPosix(rel)
    const { imports, pathRefs, typeRefs, loc } = this.parseFile(abs, content, workspacePath)
    const imported = await this.resolveImports(imports, abs, workspacePath)
    const refs = this.resolveRefs(pathRefs, typeRefs, abs, workspacePath)
    const resolved = mergeParsedImports([...imported, ...refs])

    const perWorkspace = this.ensureFileImports(workspacePath)
    const knownFiles = this.ensureKnownFiles(workspacePath)

    const delta: GraphDelta = {}
    const addNodes: GraphNode[] = []
    const addEdges: GraphEdgeWire[] = []

    if (!knownFiles.has(nodeId)) {
      addNodes.push({
        id: nodeId,
        kind: 'file',
        lang: langFromPath(abs),
        loc,
      })
      knownFiles.add(nodeId)
    }

    const map = new Map<NodeId, Set<EdgeKind>>()
    for (const imp of resolved) {
      this.ensureTargetNodeKnown(workspacePath, imp, addNodes)
      map.set(imp.target, imp.kinds)
      addEdges.push({
        from: nodeId,
        to: imp.target,
        kinds: [...imp.kinds].sort(),
      })
    }
    perWorkspace.set(nodeId, map)

    if (addNodes.length) delta.addNodes = addNodes
    if (addEdges.length) delta.addEdges = addEdges
    return addNodes.length || addEdges.length ? delta : null
  }

  private parseFile(
    abs: string,
    content: string,
    _workspacePath: string,
  ): { imports: RawImport[]; pathRefs: string[]; typeRefs: string[]; loc: number } {
    const sf = ts.createSourceFile(
      abs,
      content,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
      scriptKindForPath(abs),
    )
    const imports: RawImport[] = []
    for (const stmt of sf.statements) {
      collectImports(stmt, imports)
    }
    // Also scan for require() + import() inside expressions — depth-limited walk.
    ts.forEachChild(sf, function visit(node) {
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0]
          if (arg && ts.isStringLiteralLike(arg)) {
            imports.push({ specifier: arg.text, kinds: new Set(['dynamic']) })
          }
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' &&
          node.arguments.length === 1
        ) {
          const arg = node.arguments[0]
          if (arg && ts.isStringLiteralLike(arg)) {
            imports.push({ specifier: arg.text, kinds: new Set(['dynamic']) })
          }
        }
      }
      ts.forEachChild(node, visit)
    })
    const pathRefs = sf.referencedFiles.map((r) => r.fileName)
    const typeRefs = sf.typeReferenceDirectives.map((r) => r.fileName)
    const loc = content.split('\n').length
    return { imports: dedupeImports(imports), pathRefs, typeRefs, loc }
  }

  /**
   * Resolve triple-slash directives (`/// <reference path=... />` /
   * `/// <reference types=... />`). Path refs resolve relative to the
   * containing file; type refs collapse to a top-level external package node.
   * Emitted with `kind: 'type'` — semantically a type-only include.
   */
  private resolveRefs(
    pathRefs: string[],
    typeRefs: string[],
    containingFile: string,
    workspacePath: string,
  ): ParsedImport[] {
    const out: ParsedImport[] = []
    const dir = dirname(containingFile)
    for (const ref of pathRefs) {
      const abs = pathResolve(dir, ref)
      const rel = relPosix(workspacePath, abs)
      if (!rel) continue
      out.push({
        target: rel,
        kinds: new Set<EdgeKind>(['type']),
        targetLang: langFromPath(abs),
      })
    }
    for (const ref of typeRefs) {
      const packageName = extractRefPackageName(ref)
      out.push({
        target: `external:${packageName}`,
        kinds: new Set<EdgeKind>(['type']),
        externalName: packageName,
        targetLang: 'external',
      })
    }
    return out
  }

  private async resolveImports(
    raws: RawImport[],
    containingFile: string,
    workspacePath: string,
  ): Promise<ParsedImport[]> {
    const out: ParsedImport[] = []
    for (const raw of raws) {
      const resolved = await this.resolver.resolve({
        specifier: raw.specifier,
        containingFile,
      })
      if (!resolved) continue
      if (resolved.resolvedPath) {
        const rel = relPosix(workspacePath, resolved.resolvedPath)
        if (!rel) continue
        out.push({
          target: rel,
          kinds: reclassifyIfAsset(raw.specifier, raw.kinds),
          targetLang: resolved.lang,
        })
      } else if (resolved.packageName) {
        const id = `external:${resolved.packageName}`
        out.push({
          target: id,
          kinds: reclassifyIfAsset(raw.specifier, raw.kinds),
          externalName: resolved.packageName,
          targetLang: 'external',
        })
      }
    }
    // Dedupe by target — merge kinds.
    const byTarget = new Map<NodeId, ParsedImport>()
    for (const imp of out) {
      const existing = byTarget.get(imp.target)
      if (!existing) {
        byTarget.set(imp.target, {
          ...imp,
          kinds: new Set(imp.kinds),
        })
      } else {
        for (const k of imp.kinds) existing.kinds.add(k)
      }
    }
    return [...byTarget.values()]
  }

  private ensureTargetNodeKnown(
    workspacePath: string,
    imp: ParsedImport,
    addNodes: GraphNode[],
  ): void {
    if (imp.externalName) {
      const known = this.ensureKnownExternals(workspacePath)
      if (!known.has(imp.target)) {
        known.add(imp.target)
        addNodes.push({
          id: imp.target,
          kind: 'external',
          lang: 'external',
          external: { packageName: imp.externalName },
        })
      }
      return
    }
    const knownFiles = this.ensureKnownFiles(workspacePath)
    if (!knownFiles.has(imp.target)) {
      knownFiles.add(imp.target)
      addNodes.push({
        id: imp.target,
        kind: 'file',
        lang: (imp.targetLang as GraphNode['lang']) ?? 'ts',
      })
    }
  }

  private ensureFileImports(workspacePath: string): Map<NodeId, Map<NodeId, Set<EdgeKind>>> {
    let m = this.fileImports.get(workspacePath)
    if (!m) {
      m = new Map()
      this.fileImports.set(workspacePath, m)
    }
    return m
  }

  private ensureKnownExternals(workspacePath: string): Set<NodeId> {
    let s = this.knownExternals.get(workspacePath)
    if (!s) {
      s = new Set()
      this.knownExternals.set(workspacePath, s)
    }
    return s
  }

  private ensureKnownFiles(workspacePath: string): Set<NodeId> {
    let s = this.knownFiles.get(workspacePath)
    if (!s) {
      s = new Set()
      this.knownFiles.set(workspacePath, s)
    }
    return s
  }
}

interface RawImport {
  specifier: string
  kinds: Set<EdgeKind>
}

function collectImports(stmt: ts.Statement, out: RawImport[]): void {
  if (ts.isImportDeclaration(stmt)) {
    const kind: EdgeKind = stmt.importClause?.isTypeOnly ? 'type' : 'static'
    const spec = stmt.moduleSpecifier
    if (ts.isStringLiteralLike(spec)) {
      out.push({ specifier: spec.text, kinds: new Set([kind]) })
    }
    return
  }
  if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
    const spec = stmt.moduleSpecifier
    if (ts.isStringLiteralLike(spec)) {
      const kind: EdgeKind = stmt.isTypeOnly ? 'type' : 'reexport'
      out.push({ specifier: spec.text, kinds: new Set([kind]) })
    }
    return
  }
  if (ts.isImportEqualsDeclaration(stmt)) {
    const ref = stmt.moduleReference
    if (ts.isExternalModuleReference(ref) && ts.isStringLiteralLike(ref.expression)) {
      out.push({ specifier: ref.expression.text, kinds: new Set(['static']) })
    }
    return
  }
}

function mergeParsedImports(imps: ParsedImport[]): ParsedImport[] {
  const byTarget = new Map<NodeId, ParsedImport>()
  for (const imp of imps) {
    const existing = byTarget.get(imp.target)
    if (!existing) {
      byTarget.set(imp.target, { ...imp, kinds: new Set(imp.kinds) })
    } else {
      for (const k of imp.kinds) existing.kinds.add(k)
    }
  }
  return [...byTarget.values()]
}

function extractRefPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  const [first] = specifier.split('/')
  return first ?? specifier
}

function dedupeImports(imports: RawImport[]): RawImport[] {
  const out = new Map<string, Set<EdgeKind>>()
  for (const imp of imports) {
    const existing = out.get(imp.specifier)
    if (!existing) out.set(imp.specifier, new Set(imp.kinds))
    else for (const k of imp.kinds) existing.add(k)
  }
  return [...out.entries()].map(([specifier, kinds]) => ({ specifier, kinds }))
}

function reclassifyIfAsset(specifier: string, kinds: Set<EdgeKind>): Set<EdgeKind> {
  if (
    /\.(css|scss|sass|less|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|ico|md|mdx|json)$/i.test(specifier)
  ) {
    return new Set<EdgeKind>(['asset'])
  }
  return kinds
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs'))
    return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}

function relPosix(workspacePath: string, absPath: string): NodeId | null {
  const rel = relative(workspacePath, absPath)
  if (!rel || rel.startsWith('..')) return null
  return toPosix(rel)
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

export { basename }
