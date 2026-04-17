import type {
  GraphDeltaDTO,
  GraphEdgeKindDTO,
  GraphEdgeWireDTO,
  GraphNodeDTO,
  GraphSnapshotDTO,
} from '@shared/ipc'
import { create } from 'zustand'

export type NodeId = string
export type EdgeKind = GraphEdgeKindDTO
export type GraphNode = GraphNodeDTO

export interface GraphEdge {
  id: string // `${from}>>${to}`
  from: NodeId
  to: NodeId
  kinds: Set<EdgeKind>
}

export const EMPTY_NODES: ReadonlyMap<NodeId, GraphNode> = Object.freeze(
  new Map<NodeId, GraphNode>(),
) as ReadonlyMap<NodeId, GraphNode>
export const EMPTY_EDGES: ReadonlyMap<string, GraphEdge> = Object.freeze(
  new Map<string, GraphEdge>(),
) as ReadonlyMap<string, GraphEdge>
export const EMPTY_ID_SET: ReadonlySet<string> = Object.freeze(new Set<string>())

export function canonicalEdgeId(from: NodeId, to: NodeId): string {
  return `${from}>>${to}`
}

interface WorkspaceGraph {
  nodes: Map<NodeId, GraphNode>
  edges: Map<string, GraphEdge>
  outgoing: Map<NodeId, Set<string>>
  incoming: Map<NodeId, Set<string>>
  scanning: boolean
  filesScanned: number
  autoCap: { minDegree: number } | null
}

interface DepGraphState {
  /** workspaceId → graph */
  byWorkspace: Map<string, WorkspaceGraph>
  /** Monotonic bump for selectors that want a render on any mutation of a ws. */
  versionByWorkspace: Record<string, number>

  ingestSnapshot: (snap: GraphSnapshotDTO) => void
  ingestDelta: (workspaceId: string, delta: GraphDeltaDTO) => void
  setScanProgress: (workspaceId: string, filesScanned: number) => void
  setScanEnd: (workspaceId: string, finalNodeCount: number, finalEdgeCount: number) => void
  clearWorkspace: (workspaceId: string) => void
}

function emptyWorkspaceGraph(): WorkspaceGraph {
  return {
    nodes: new Map(),
    edges: new Map(),
    outgoing: new Map(),
    incoming: new Map(),
    scanning: false,
    filesScanned: 0,
    autoCap: null,
  }
}

function clone(g: WorkspaceGraph): WorkspaceGraph {
  return {
    nodes: new Map(g.nodes),
    edges: new Map(g.edges),
    outgoing: new Map([...g.outgoing].map(([k, v]) => [k, new Set(v)])),
    incoming: new Map([...g.incoming].map(([k, v]) => [k, new Set(v)])),
    scanning: g.scanning,
    filesScanned: g.filesScanned,
    autoCap: g.autoCap,
  }
}

function addEdge(g: WorkspaceGraph, wire: GraphEdgeWireDTO): void {
  const id = canonicalEdgeId(wire.from, wire.to)
  g.edges.set(id, {
    id,
    from: wire.from,
    to: wire.to,
    kinds: new Set(wire.kinds),
  })
  getOrInit(g.outgoing, wire.from).add(id)
  getOrInit(g.incoming, wire.to).add(id)
}

function removeEdgeBy(g: WorkspaceGraph, from: NodeId, to: NodeId): void {
  const id = canonicalEdgeId(from, to)
  g.edges.delete(id)
  g.outgoing.get(from)?.delete(id)
  g.incoming.get(to)?.delete(id)
}

function getOrInit<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  let s = map.get(key)
  if (!s) {
    s = new Set()
    map.set(key, s)
  }
  return s
}

export const useDepGraph = create<DepGraphState>((set) => ({
  byWorkspace: new Map(),
  versionByWorkspace: {},

  ingestSnapshot: (snap) =>
    set((s) => {
      const g = emptyWorkspaceGraph()
      for (const n of snap.nodes) g.nodes.set(n.id, n)
      for (const e of snap.edges) addEdge(g, e)
      g.scanning = !snap.scanDone
      const next = new Map(s.byWorkspace)
      next.set(snap.workspaceId, g)
      return {
        byWorkspace: next,
        versionByWorkspace: {
          ...s.versionByWorkspace,
          [snap.workspaceId]: (s.versionByWorkspace[snap.workspaceId] ?? 0) + 1,
        },
      }
    }),

  ingestDelta: (workspaceId, delta) =>
    set((s) => {
      const base = s.byWorkspace.get(workspaceId) ?? emptyWorkspaceGraph()
      const g = clone(base)
      if (delta.addNodes) {
        for (const n of delta.addNodes) g.nodes.set(n.id, n)
      }
      if (delta.addEdges) {
        for (const e of delta.addEdges) addEdge(g, e)
      }
      if (delta.updateEdgeKinds) {
        for (const e of delta.updateEdgeKinds) {
          const id = canonicalEdgeId(e.from, e.to)
          const edge = g.edges.get(id)
          if (edge) edge.kinds = new Set(e.kinds)
        }
      }
      if (delta.removeEdges) {
        for (const e of delta.removeEdges) removeEdgeBy(g, e.from, e.to)
      }
      if (delta.removeNodes) {
        for (const id of delta.removeNodes) {
          g.nodes.delete(id)
          const outgoing = g.outgoing.get(id)
          if (outgoing) {
            for (const eid of outgoing) {
              const e = g.edges.get(eid)
              if (e) g.incoming.get(e.to)?.delete(eid)
              g.edges.delete(eid)
            }
            g.outgoing.delete(id)
          }
          const incoming = g.incoming.get(id)
          if (incoming) {
            for (const eid of incoming) {
              const e = g.edges.get(eid)
              if (e) g.outgoing.get(e.from)?.delete(eid)
              g.edges.delete(eid)
            }
            g.incoming.delete(id)
          }
        }
      }
      const next = new Map(s.byWorkspace)
      next.set(workspaceId, g)
      return {
        byWorkspace: next,
        versionByWorkspace: {
          ...s.versionByWorkspace,
          [workspaceId]: (s.versionByWorkspace[workspaceId] ?? 0) + 1,
        },
      }
    }),

  setScanProgress: (workspaceId, filesScanned) =>
    set((s) => {
      const base = s.byWorkspace.get(workspaceId) ?? emptyWorkspaceGraph()
      const g = clone(base)
      g.scanning = true
      g.filesScanned = filesScanned
      const next = new Map(s.byWorkspace)
      next.set(workspaceId, g)
      return { byWorkspace: next }
    }),

  setScanEnd: (workspaceId, _finalNodeCount, _finalEdgeCount) =>
    set((s) => {
      const base = s.byWorkspace.get(workspaceId) ?? emptyWorkspaceGraph()
      const g = clone(base)
      g.scanning = false
      const next = new Map(s.byWorkspace)
      next.set(workspaceId, g)
      return { byWorkspace: next }
    }),

  clearWorkspace: (workspaceId) =>
    set((s) => {
      if (!s.byWorkspace.has(workspaceId)) return s
      const next = new Map(s.byWorkspace)
      next.delete(workspaceId)
      return { byWorkspace: next }
    }),
}))

// Selectors with stable empty-fallbacks (per state-patterns rule).

export function selectNodes(
  workspaceId: string | null | undefined,
): (s: DepGraphState) => ReadonlyMap<NodeId, GraphNode> {
  if (!workspaceId) return () => EMPTY_NODES
  return (s) => s.byWorkspace.get(workspaceId)?.nodes ?? EMPTY_NODES
}

export function selectEdges(
  workspaceId: string | null | undefined,
): (s: DepGraphState) => ReadonlyMap<string, GraphEdge> {
  if (!workspaceId) return () => EMPTY_EDGES
  return (s) => s.byWorkspace.get(workspaceId)?.edges ?? EMPTY_EDGES
}

export function selectIncoming(
  workspaceId: string | null | undefined,
  nodeId: NodeId,
): (s: DepGraphState) => ReadonlySet<string> {
  if (!workspaceId) return () => EMPTY_ID_SET
  return (s) => s.byWorkspace.get(workspaceId)?.incoming.get(nodeId) ?? EMPTY_ID_SET
}

export function selectOutgoing(
  workspaceId: string | null | undefined,
  nodeId: NodeId,
): (s: DepGraphState) => ReadonlySet<string> {
  if (!workspaceId) return () => EMPTY_ID_SET
  return (s) => s.byWorkspace.get(workspaceId)?.outgoing.get(nodeId) ?? EMPTY_ID_SET
}
