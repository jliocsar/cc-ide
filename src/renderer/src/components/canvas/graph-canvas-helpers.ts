import type { GraphEdge, GraphNode } from '@/state/depgraph'
import type { getFilters, getStyle } from '@/state/board-ui'

export function filterVisible(
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>,
  filters: ReturnType<typeof getFilters>,
  _style: ReturnType<typeof getStyle>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeList: GraphNode[] = []
  const nodeKeepIds = new Set<string>()
  const inCount = new Map<string, number>()
  const outCount = new Map<string, number>()
  for (const e of edges.values()) {
    let anyAllowed = false
    for (const k of e.kinds) {
      if (filters.edgeKinds.has(k)) {
        anyAllowed = true
        break
      }
    }
    if (!anyAllowed) continue
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1)
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1)
  }
  for (const n of nodes.values()) {
    if (!filters.showExternals && n.kind === 'external') continue
    const inD = inCount.get(n.id) ?? 0
    const outD = outCount.get(n.id) ?? 0
    if (inD < filters.minInDegree) continue
    if (outD < filters.minOutDegree) continue
    if (filters.pathInclude && !matchGlob(n.id, filters.pathInclude)) continue
    if (filters.pathExclude && matchGlob(n.id, filters.pathExclude)) continue
    nodeKeepIds.add(n.id)
    nodeList.push(n)
  }
  const edgeList: GraphEdge[] = []
  for (const e of edges.values()) {
    let anyAllowed = false
    for (const k of e.kinds) {
      if (filters.edgeKinds.has(k)) {
        anyAllowed = true
        break
      }
    }
    if (!anyAllowed) continue
    if (!nodeKeepIds.has(e.from) || !nodeKeepIds.has(e.to)) continue
    edgeList.push(e)
  }
  return { nodes: nodeList, edges: edgeList }
}

function matchGlob(path: string, pattern: string): boolean {
  const esc = pattern
    .split('**')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*')
  const re = new RegExp(`^${esc}$`)
  return re.test(path)
}

export function radiusFor(
  n: GraphNode,
  edges: ReadonlyMap<string, GraphEdge> | undefined,
  style: ReturnType<typeof getStyle>,
): number {
  if (style.nodeSize === 'fixed') return 4
  if (style.nodeSize === 'loc') return Math.max(3, Math.min(14, Math.log2((n.loc ?? 10) + 1) * 1.5))
  let d = 0
  if (edges) {
    for (const e of edges.values()) {
      if (e.to === n.id) d++
      if (e.from === n.id) d++
    }
  }
  return Math.max(3, Math.min(12, 3 + Math.log2(d + 1) * 1.6))
}

const FOLDER_PALETTE = [
  'oklch(0.72 0.1 240)',
  'oklch(0.70 0.1 30)',
  'oklch(0.72 0.1 140)',
  'oklch(0.70 0.1 330)',
  'oklch(0.70 0.1 200)',
  'oklch(0.72 0.1 90)',
  'oklch(0.70 0.1 60)',
  'oklch(0.70 0.1 300)',
]

function folderColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  const idx = Math.abs(h) % FOLDER_PALETTE.length
  return FOLDER_PALETTE[idx]!
}

export function colorFor(n: GraphNode, style: ReturnType<typeof getStyle>): string {
  if (style.nodeColor === 'uniform') return 'oklch(0.72 0 0)'
  if (style.nodeColor === 'filetype') {
    switch (n.lang) {
      case 'ts':
      case 'tsx':
        return 'oklch(0.68 0.09 240)'
      case 'js':
      case 'jsx':
        return 'oklch(0.80 0.1 90)'
      case 'css':
        return 'oklch(0.75 0.09 310)'
      case 'json':
        return 'oklch(0.78 0.08 60)'
      case 'dts':
        return 'oklch(0.55 0.06 260)'
      case 'external':
        return 'oklch(0.50 0.04 0)'
      default:
        return 'oklch(0.72 0 0)'
    }
  }
  const top = n.id.split('/')[0] ?? n.id
  return folderColor(top)
}

export function strokeForKinds(kinds: string[]): string {
  if (kinds.includes('asset')) return 'oklch(0.45 0 0)'
  if (kinds.includes('dynamic')) return 'oklch(0.68 0.1 60)'
  if (kinds.includes('type')) return 'oklch(0.55 0 0)'
  return 'oklch(0.70 0 0)'
}

export function dashForKinds(kinds: string[]): number[] {
  if (kinds.includes('type')) return [3, 3]
  if (kinds.includes('dynamic')) return [2, 2]
  if (kinds.includes('asset')) return [1, 3]
  return []
}

export function countIncoming(edges: ReadonlyMap<string, GraphEdge>, id: string): number {
  let n = 0
  for (const e of edges.values()) if (e.to === id) n++
  return n
}

export function countOutgoing(edges: ReadonlyMap<string, GraphEdge>, id: string): number {
  let n = 0
  for (const e of edges.values()) if (e.from === id) n++
  return n
}

export function labelFor(n: GraphNode): string {
  if (n.kind === 'external') return n.external?.packageName ?? n.id
  const parts = n.id.split('/')
  return parts[parts.length - 1] ?? n.id
}

export function computeNodeOpacity(
  anim: { appearAt: number; disappearAt: number | null } | undefined,
  now: number,
): number {
  if (!anim) return 1
  if (anim.disappearAt !== null) {
    const t = (now - anim.disappearAt) / 200
    if (t >= 1) return -1
    return 1 - t
  }
  const t = (now - anim.appearAt) / 300
  return Math.min(1, Math.max(0, t))
}
