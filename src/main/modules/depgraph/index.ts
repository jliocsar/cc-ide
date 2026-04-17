import { type FSWatcher, promises as fsp, watch } from 'node:fs'
import { resolve, sep } from 'node:path'
import { broadcast } from '../event-bus'
import { DeltaCoalescer } from './delta-coalescer'
import { defaultRegistry, type ParserRegistry } from './parser-registry'
import { TsParser } from './ts-parser'
import type { GraphDelta, GraphEdgeWire, GraphNode, NodeId } from './types'
import { canonicalEdgeId, emptyWorkspaceGraphState, type WorkspaceGraphState } from './types'

const PER_FILE_DEBOUNCE_MS = 150
const FRAME_MS = 16

interface Subscription {
  workspaceId: string
  workspacePath: string
  registry: ParserRegistry
  state: WorkspaceGraphState
  coalescer: DeltaCoalescer
  watcher: FSWatcher | null
  scanAbort: { aborted: boolean }
  pendingFlushTimer: ReturnType<typeof setTimeout> | null
  pendingFileTimers: Map<string, ReturnType<typeof setTimeout>>
  fileCount: { nodes: number; edges: number }
}

const subs = new Map<string, Subscription>()

export async function subscribe(workspaceId: string, workspacePath: string): Promise<void> {
  const existing = subs.get(workspaceId)
  if (existing) {
    emitSnapshot(existing, /*scanDone*/ true)
    return
  }
  const registry = defaultRegistry()
  const sub: Subscription = {
    workspaceId,
    workspacePath,
    registry,
    state: emptyWorkspaceGraphState(),
    coalescer: new DeltaCoalescer(),
    watcher: null,
    scanAbort: { aborted: false },
    pendingFlushTimer: null,
    pendingFileTimers: new Map(),
    fileCount: { nodes: 0, edges: 0 },
  }
  subs.set(workspaceId, sub)

  // Start with an empty snapshot so the renderer has something immediately.
  emitSnapshot(sub, /*scanDone*/ false)

  void runInitialScan(sub).catch((err: unknown) => {
    broadcast('graph:error', {
      workspaceId,
      message: err instanceof Error ? err.message : String(err),
    })
  })

  attachWatcher(sub)
}

export async function unsubscribe(workspaceId: string): Promise<void> {
  const sub = subs.get(workspaceId)
  if (!sub) return
  sub.scanAbort.aborted = true
  for (const parser of sub.registry.all()) parser.stop()
  if (sub.watcher) sub.watcher.close()
  if (sub.pendingFlushTimer) clearTimeout(sub.pendingFlushTimer)
  for (const t of sub.pendingFileTimers.values()) clearTimeout(t)
  sub.pendingFileTimers.clear()
  for (const parser of sub.registry.all()) {
    if (parser instanceof TsParser) parser.forgetWorkspace(sub.workspacePath)
  }
  subs.delete(workspaceId)
}

export async function refresh(workspaceId: string, workspacePath: string): Promise<void> {
  await unsubscribe(workspaceId)
  await subscribe(workspaceId, workspacePath)
}

export async function disposeAll(): Promise<void> {
  for (const id of [...subs.keys()]) {
    await unsubscribe(id)
  }
}

// ──────────────────── Scan ────────────────────

async function runInitialScan(sub: Subscription): Promise<void> {
  let filesScanned = 0
  for (const parser of sub.registry.all()) {
    if (sub.scanAbort.aborted) return
    for await (const delta of parser.scan(sub.workspacePath)) {
      if (sub.scanAbort.aborted) return
      applyAndQueue(sub, delta)
      filesScanned += delta.addNodes?.filter((n) => n.kind === 'file').length ?? 0
      if (filesScanned % 50 === 0) {
        broadcast('graph:scanProgress', {
          workspaceId: sub.workspaceId,
          filesScanned,
          filesTotal: null,
        })
      }
    }
  }
  // Flush any remaining deltas immediately
  flushNow(sub)
  broadcast('graph:scanEnd', {
    workspaceId: sub.workspaceId,
    finalNodeCount: sub.state.nodes.size,
    finalEdgeCount: sub.state.edges.size,
  })
}

function applyAndQueue(sub: Subscription, delta: GraphDelta): void {
  applyToState(sub.state, delta)
  sub.coalescer.add(delta)
  if (!sub.pendingFlushTimer) {
    sub.pendingFlushTimer = setTimeout(() => flushNow(sub), FRAME_MS)
  }
}

function flushNow(sub: Subscription): void {
  if (sub.pendingFlushTimer) {
    clearTimeout(sub.pendingFlushTimer)
    sub.pendingFlushTimer = null
  }
  const flushed = sub.coalescer.flush()
  if (!flushed) return
  broadcast('graph:delta', {
    workspaceId: sub.workspaceId,
    delta: flushed,
  })
}

// ──────────────────── Watcher ────────────────────

function attachWatcher(sub: Subscription): void {
  try {
    const w = watch(
      sub.workspacePath,
      { recursive: true, persistent: false },
      (_eventType, filename) => {
        if (!filename) return
        const abs = resolve(sub.workspacePath, filename.toString())
        scheduleFileRecheck(sub, abs)
      },
    )
    w.on('error', () => {})
    sub.watcher = w
  } catch {
    sub.watcher = null
  }
}

function scheduleFileRecheck(sub: Subscription, absPath: string): void {
  const prev = sub.pendingFileTimers.get(absPath)
  if (prev) clearTimeout(prev)
  const timer = setTimeout(() => {
    sub.pendingFileTimers.delete(absPath)
    void handleFileChange(sub, absPath)
  }, PER_FILE_DEBOUNCE_MS)
  sub.pendingFileTimers.set(absPath, timer)
}

async function handleFileChange(sub: Subscription, absPath: string): Promise<void> {
  // Skip hidden dirs and vcs metadata
  if (/(^|\/|\\)(\.git|node_modules)(\/|\\|$)/.test(absPath)) return

  // tsconfig?
  const base = absPath.split(sep).pop() ?? ''
  if (/^tsconfig.*\.json$/i.test(base)) {
    for (const parser of sub.registry.all()) {
      if (parser instanceof TsParser) await parser.onTsconfigChange(absPath)
    }
    // Not a file-level delta — the graph itself doesn't change, only future
    // resolutions do. No emit.
    return
  }

  const parser = sub.registry.forPath(absPath)
  if (!parser) return

  // Does the file exist?
  const exists = await fsp
    .stat(absPath)
    .then(() => true)
    .catch(() => false)
  if (!exists) {
    handleFileDelete(sub, absPath)
    return
  }

  if (!parser.onFileChange) return
  const delta = await parser.onFileChange(absPath, sub.workspacePath)
  if (!delta) return
  applyAndQueue(sub, delta)
}

function handleFileDelete(sub: Subscription, absPath: string): void {
  const relPath = relPosix(sub.workspacePath, absPath)
  if (!relPath) return
  const state = sub.state
  if (!state.nodes.has(relPath)) return
  const removeEdges: { from: NodeId; to: NodeId }[] = []
  const removeNodes: NodeId[] = [relPath]
  const incoming = state.incoming.get(relPath)
  if (incoming) {
    for (const eid of incoming) {
      const edge = state.edges.get(eid)
      if (edge) removeEdges.push({ from: edge.from, to: edge.to })
    }
  }
  const outgoing = state.outgoing.get(relPath)
  if (outgoing) {
    for (const eid of outgoing) {
      const edge = state.edges.get(eid)
      if (edge) removeEdges.push({ from: edge.from, to: edge.to })
    }
  }
  applyAndQueue(sub, { removeNodes, removeEdges })
  // Parser-side bookkeeping
  for (const parser of sub.registry.all()) {
    if (parser instanceof TsParser) {
      // Drop stale import list for this file so a re-add re-emits full
      parser['fileImports'].get(sub.workspacePath)?.delete(relPath)
      parser['knownFiles'].get(sub.workspacePath)?.delete(relPath)
    }
  }
}

// ──────────────────── Snapshot ────────────────────

function emitSnapshot(sub: Subscription, scanDone: boolean): void {
  const nodes: GraphNode[] = [...sub.state.nodes.values()]
  const edges: GraphEdgeWire[] = [...sub.state.edges.values()].map((e) => ({
    from: e.from,
    to: e.to,
    kinds: [...e.kinds].sort(),
  }))
  broadcast('graph:snapshot', {
    workspaceId: sub.workspaceId,
    nodes,
    edges,
    scanDone,
  })
}

// ──────────────────── State application ────────────────────

function applyToState(state: WorkspaceGraphState, delta: GraphDelta): void {
  if (delta.addNodes) {
    for (const n of delta.addNodes) state.nodes.set(n.id, n)
  }
  if (delta.addEdges) {
    for (const e of delta.addEdges) {
      const id = canonicalEdgeId(e.from, e.to)
      state.edges.set(id, {
        from: e.from,
        to: e.to,
        kinds: new Set(e.kinds),
      })
      getOrInit(state.outgoing, e.from).add(id)
      getOrInit(state.incoming, e.to).add(id)
    }
  }
  if (delta.updateEdgeKinds) {
    for (const e of delta.updateEdgeKinds) {
      const id = canonicalEdgeId(e.from, e.to)
      const edge = state.edges.get(id)
      if (edge) edge.kinds = new Set(e.kinds)
    }
  }
  if (delta.removeEdges) {
    for (const e of delta.removeEdges) {
      const id = canonicalEdgeId(e.from, e.to)
      state.edges.delete(id)
      state.outgoing.get(e.from)?.delete(id)
      state.incoming.get(e.to)?.delete(id)
    }
  }
  if (delta.removeNodes) {
    for (const id of delta.removeNodes) {
      state.nodes.delete(id)
      // Cascade-clean indices: any edge still pointing at/from us dies
      const outgoing = state.outgoing.get(id)
      if (outgoing) {
        for (const eid of outgoing) {
          const e = state.edges.get(eid)
          if (e) state.incoming.get(e.to)?.delete(eid)
          state.edges.delete(eid)
        }
        state.outgoing.delete(id)
      }
      const incoming = state.incoming.get(id)
      if (incoming) {
        for (const eid of incoming) {
          const e = state.edges.get(eid)
          if (e) state.outgoing.get(e.from)?.delete(eid)
          state.edges.delete(eid)
        }
        state.incoming.delete(id)
      }
    }
  }
}

function getOrInit<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  let s = map.get(key)
  if (!s) {
    s = new Set()
    map.set(key, s)
  }
  return s
}

function relPosix(workspacePath: string, absPath: string): NodeId | null {
  if (!absPath.startsWith(workspacePath)) return null
  let r = absPath.slice(workspacePath.length)
  if (r.startsWith(sep)) r = r.slice(sep.length)
  return r.split(sep).join('/')
}
