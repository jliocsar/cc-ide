/// <reference lib="webworker" />
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type {
  WorkerEdge,
  WorkerIn,
  WorkerOut,
  WorkerSeedPosition,
} from './depgraph-layout.types'

interface SimNode extends SimulationNodeDatum {
  id: string
  /** Stable index into the positions Float32Array. */
  __index: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
  weight: number
}

type MaybeWorker = DedicatedWorkerGlobalScope

// Cast self to the worker global. Vite's worker runtime provides this.
const ctx: MaybeWorker = self as unknown as MaybeWorker

const nodes: SimNode[] = []
const nodeById = new Map<string, SimNode>()
const edges: SimLink[] = []
const edgeKey = new Map<string, SimLink>()
let nextIndex = 0
let idMapDirty = true
let sim: Simulation<SimNode, SimLink> | null = null
let lastTickPostAt = 0
let lastTickMs = 0

function post(msg: WorkerOut, transfer?: Transferable[]): void {
  if (transfer && transfer.length) ctx.postMessage(msg, transfer)
  else ctx.postMessage(msg)
}

function ensureSim(): Simulation<SimNode, SimLink> {
  if (sim) return sim
  sim = forceSimulation<SimNode, SimLink>(nodes)
    .force('charge', forceManyBody<SimNode>().strength(-100))
    .force(
      'link',
      forceLink<SimNode, SimLink>(edges)
        .id((n) => n.id)
        .distance(40)
        .strength((l) => Math.min(1, (l as SimLink).weight * 0.5)),
    )
    .force('center', forceCenter<SimNode>(0, 0).strength(0.05))
    .alpha(1)
    .alphaMin(0.01)
    .alphaDecay(0.02)
    .on('tick', onTick)
  return sim
}

function onTick(): void {
  // Rate-limit to roughly rAF cadence (16ms) to avoid flooding main thread.
  const now = performance.now()
  const sinceLast = now - lastTickPostAt
  if (sinceLast < 15) return
  const t0 = performance.now()
  if (idMapDirty) {
    post({
      type: 'idMap',
      mapping: nodes.map((n) => ({ id: n.id, index: n.__index })),
    })
    idMapDirty = false
  }
  const buf = new Float32Array(nodes.length * 3)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    buf[i * 3] = n.__index
    buf[i * 3 + 1] = n.x ?? 0
    buf[i * 3 + 2] = n.y ?? 0
  }
  post({ type: 'tick', positions: buf }, [buf.buffer])
  lastTickMs = performance.now() - t0
  lastTickPostAt = now
}

function addNode(id: string, seed?: WorkerSeedPosition): SimNode {
  let node = nodeById.get(id)
  if (node) return node
  node = {
    id,
    __index: nextIndex++,
    x: seed?.x ?? (Math.random() - 0.5) * 80,
    y: seed?.y ?? (Math.random() - 0.5) * 80,
  }
  nodes.push(node)
  nodeById.set(id, node)
  idMapDirty = true
  return node
}

function removeNode(id: string): void {
  const node = nodeById.get(id)
  if (!node) return
  const idx = nodes.indexOf(node)
  if (idx !== -1) nodes.splice(idx, 1)
  nodeById.delete(id)
  // Remove edges touching this node
  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i]!
    const srcId = typeof e.source === 'string' ? e.source : e.source.id
    const tgtId = typeof e.target === 'string' ? e.target : e.target.id
    if (srcId === id || tgtId === id) {
      edges.splice(i, 1)
      edgeKey.delete(`${srcId}>>${tgtId}`)
    }
  }
  idMapDirty = true
}

function neighborCentroid(edgeList: WorkerEdge[]): {
  x: number
  y: number
} | null {
  let sx = 0
  let sy = 0
  let count = 0
  for (const e of edgeList) {
    const neighbor = nodeById.get(e.from === newNode ? e.to : e.from)
    if (neighbor && typeof neighbor.x === 'number' && typeof neighbor.y === 'number') {
      sx += neighbor.x
      sy += neighbor.y
      count++
    }
  }
  return count > 0 ? { x: sx / count, y: sy / count } : null
}

// Scratch to share with neighborCentroid. Set before calling.
let newNode: string | null = null

function keyFor(from: string, to: string): string {
  return `${from}>>${to}`
}

function addEdge(wire: WorkerEdge): void {
  const key = keyFor(wire.from, wire.to)
  const existing = edgeKey.get(key)
  const weight = Math.max(1, wire.kinds.length)
  if (existing) {
    existing.weight = weight
    return
  }
  // Ensure both endpoints exist as nodes (may not if delta arrives out of order).
  if (!nodeById.has(wire.from)) addNode(wire.from)
  if (!nodeById.has(wire.to)) addNode(wire.to)
  const link: SimLink = {
    source: wire.from,
    target: wire.to,
    weight,
  }
  edges.push(link)
  edgeKey.set(key, link)
}

function removeEdge(from: string, to: string): void {
  const key = keyFor(from, to)
  const link = edgeKey.get(key)
  if (!link) return
  const idx = edges.indexOf(link)
  if (idx !== -1) edges.splice(idx, 1)
  edgeKey.delete(key)
}

function updateEdgeKinds(wire: WorkerEdge): void {
  const key = keyFor(wire.from, wire.to)
  const link = edgeKey.get(key)
  if (!link) return
  link.weight = Math.max(1, wire.kinds.length)
}

function reheat(alpha: number): void {
  const s = ensureSim()
  s.alpha(Math.max(s.alpha(), alpha))
  s.alphaTarget(alpha * 0.5)
  s.restart()
  // Cool back to zero after a short window so it doesn't run hot forever.
  setTimeout(() => {
    s.alphaTarget(0)
  }, 900)
}

function rebindForceLink(): void {
  if (!sim) return
  const f = sim.force('link') as
    | (ReturnType<typeof forceLink<SimNode, SimLink>> | null)
  if (f) f.links(edges)
}

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data
  if (msg.type === 'init') {
    nodes.length = 0
    nodeById.clear()
    edges.length = 0
    edgeKey.clear()
    nextIndex = 0
    idMapDirty = true
    const seedMap = new Map<string, WorkerSeedPosition>()
    for (const s of msg.seedPositions ?? []) seedMap.set(s.id, s)
    for (const n of msg.nodes) addNode(n.id, seedMap.get(n.id))
    for (const e of msg.edges) addEdge(e)
    ensureSim().nodes(nodes).alpha(1).restart()
    rebindForceLink()
    post({ type: 'stats', tickMs: lastTickMs, fps: 0 })
    return
  }
  if (msg.type === 'delta') {
    let topologyChanged = false
    if (msg.addNodes) {
      // Spawn at neighbor centroid if we can figure one out.
      for (const n of msg.addNodes) {
        if (nodeById.has(n.id)) continue
        newNode = n.id
        const relatedEdges =
          msg.addEdges?.filter((e) => e.from === n.id || e.to === n.id) ?? []
        const centroid = neighborCentroid(relatedEdges)
        addNode(n.id, centroid ? { id: n.id, x: centroid.x, y: centroid.y } : undefined)
        newNode = null
        topologyChanged = true
      }
    }
    if (msg.addEdges) {
      for (const e of msg.addEdges) addEdge(e)
      topologyChanged = true
    }
    if (msg.updateEdgeKinds) {
      for (const e of msg.updateEdgeKinds) updateEdgeKinds(e)
    }
    if (msg.removeEdges) {
      for (const e of msg.removeEdges) removeEdge(e.from, e.to)
      topologyChanged = true
    }
    if (msg.removeNodes) {
      for (const id of msg.removeNodes) removeNode(id)
      topologyChanged = true
    }
    if (topologyChanged) {
      ensureSim().nodes(nodes)
      rebindForceLink()
      reheat(0.3)
    }
    return
  }
  if (msg.type === 'reheat') {
    reheat(msg.alpha)
    return
  }
  if (msg.type === 'stop') {
    sim?.stop()
    sim = null
    nodes.length = 0
    edges.length = 0
    nodeById.clear()
    edgeKey.clear()
    nextIndex = 0
    return
  }
}
