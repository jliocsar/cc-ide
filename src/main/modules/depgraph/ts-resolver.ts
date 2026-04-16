import ts from 'typescript'
import type { ModuleResolver, ResolvedModule, ResolverArgs, Lang } from './types'
import type { TsconfigCascade } from './tsconfig-cascade'

const FALLBACK_OPTIONS: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowJs: true,
  resolveJsonModule: true,
}

const MODULE_CACHE = ts.createModuleResolutionCache(
  ts.sys.getCurrentDirectory(),
  (s) => s,
  FALLBACK_OPTIONS,
)

const NAIVE_EXTS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.d.ts',
]
const NAIVE_INDEX_EXTS = NAIVE_EXTS.map((e) => `/index${e}`)

export class TsModuleResolver implements ModuleResolver {
  constructor(private readonly cascade: TsconfigCascade) {}

  async resolve(args: ResolverArgs): Promise<ResolvedModule | null> {
    const { specifier, containingFile } = args

    // Quick-pick asset imports (.css/.json/.svg etc) — just check file on disk.
    if (looksLikeAsset(specifier) && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      return this.resolveRelative(specifier, containingFile)
    }

    const entry = this.cascade.nearest(containingFile)
    const options = entry?.options ?? FALLBACK_OPTIONS

    const result = ts.resolveModuleName(
      specifier,
      containingFile,
      options,
      ts.sys,
      MODULE_CACHE,
    )
    const resolved = result.resolvedModule
    if (!resolved) {
      return this.naiveRelativeFallback(specifier, containingFile)
    }
    const lang = langFromPath(resolved.resolvedFileName)
    if (resolved.isExternalLibraryImport) {
      return {
        resolvedPath: null,
        packageName: resolved.packageId?.name ?? extractPackageName(specifier),
        lang: 'external',
      }
    }
    return {
      resolvedPath: resolved.resolvedFileName,
      lang,
    }
  }

  private async resolveRelative(
    specifier: string,
    containingFile: string,
  ): Promise<ResolvedModule | null> {
    const path = await tryResolveAsFile(specifier, containingFile)
    if (!path) return null
    return { resolvedPath: path, lang: langFromPath(path) }
  }

  private async naiveRelativeFallback(
    specifier: string,
    containingFile: string,
  ): Promise<ResolvedModule | null> {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      // Bare specifier we couldn't resolve — probably an uninstalled package.
      // Emit as external by name, no path.
      return {
        resolvedPath: null,
        packageName: extractPackageName(specifier),
        lang: 'external',
      }
    }
    const path = await tryResolveAsFile(specifier, containingFile)
    if (!path) return null
    return { resolvedPath: path, lang: langFromPath(path) }
  }
}

export function langFromPath(absPath: string): Lang {
  const lower = absPath.toLowerCase()
  if (lower.endsWith('.d.ts')) return 'dts'
  if (lower.endsWith('.tsx')) return 'tsx'
  if (lower.endsWith('.ts')) return 'ts'
  if (lower.endsWith('.jsx')) return 'jsx'
  if (lower.endsWith('.mjs') || lower.endsWith('.cjs') || lower.endsWith('.js'))
    return 'js'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass'))
    return 'css'
  return 'ts'
}

function looksLikeAsset(specifier: string): boolean {
  return /\.(css|scss|sass|less|json|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|ico|md|mdx)$/i.test(
    specifier,
  )
}

function extractPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  const [first] = specifier.split('/')
  return first ?? specifier
}

async function tryResolveAsFile(
  specifier: string,
  containingFile: string,
): Promise<string | null> {
  const { promises: fsp } = await import('node:fs')
  const { resolve, dirname } = await import('node:path')
  const baseDir = dirname(containingFile)
  const abs = specifier.startsWith('/')
    ? specifier
    : resolve(baseDir, specifier)

  try {
    const stat = await fsp.stat(abs).catch(() => null)
    if (stat?.isFile()) return abs
  } catch {}

  for (const ext of NAIVE_EXTS) {
    try {
      const cand = abs + ext
      const stat = await fsp.stat(cand).catch(() => null)
      if (stat?.isFile()) return cand
    } catch {}
  }
  for (const indexExt of NAIVE_INDEX_EXTS) {
    try {
      const cand = abs + indexExt
      const stat = await fsp.stat(cand).catch(() => null)
      if (stat?.isFile()) return cand
    } catch {}
  }
  return null
}
