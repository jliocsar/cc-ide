import type { GraphEdge, GraphNode } from '@/state/depgraph'
import { countIncoming, countOutgoing, labelFor } from './graph-canvas-helpers'

interface Props {
  node: GraphNode
  edges: ReadonlyMap<string, GraphEdge> | undefined
  x: number
  y: number
}

export function GraphHoverTooltip({ node, edges, x, y }: Props): JSX.Element {
  const incoming = edges ? countIncoming(edges, node.id) : 0
  const outgoing = edges ? countOutgoing(edges, node.id) : 0
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[420px] rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] shadow"
      style={{ left: x + 12, top: y + 12 }}
    >
      <div className="truncate text-foreground">{labelFor(node)}</div>
      <div className="text-[10px] text-muted-foreground">
        {node.loc !== undefined ? `LOC ${node.loc} · ` : ''}
        in {incoming} · out {outgoing}
      </div>
    </div>
  )
}
