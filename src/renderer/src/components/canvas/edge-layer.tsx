import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { CanvasWindow, Edge } from '@/state/canvas'
import { useCanvas } from '@/state/canvas'

// Curved SVG edges drawn between windows. Lives inside the world-transform
// container so edges scale + translate with the canvas. No zIndex → always
// renders behind windows (which carry explicit zIndex > 0). Pointer-events
// disabled so the SVG never swallows window/titlebar interactions.

type ResolvedEdge = {
  id: string
  state: Edge['state']
  kind: Edge['kind']
  from: { x: number; y: number }
  to: { x: number; y: number }
}

function resolveEdge(edge: Edge, windowsById: Map<string, CanvasWindow>): ResolvedEdge | null {
  const from = windowsById.get(edge.fromWindowId)
  const to = windowsById.get(edge.toWindowId)
  if (!from || !to) return null
  return {
    id: edge.id,
    state: edge.state,
    kind: edge.kind,
    from: { x: from.x + from.width, y: from.y + from.height / 2 },
    to: { x: to.x, y: to.y + to.height / 2 },
  }
}

// Cubic bezier horizontal "wire": control points at the horizontal midpoint.
// Clamp dx to a sensible minimum so overlapping windows still produce a
// visible curve instead of a tight spike.
function pathFor(e: ResolvedEdge): string {
  const dx = Math.max(40, Math.abs(e.to.x - e.from.x) / 2)
  const c1x = e.from.x + dx
  const c2x = e.to.x - dx
  return `M ${e.from.x} ${e.from.y} C ${c1x} ${e.from.y}, ${c2x} ${e.to.y}, ${e.to.x} ${e.to.y}`
}

function bounds(edges: ResolvedEdge[]): { x: number; y: number; w: number; h: number } {
  if (edges.length === 0) return { x: 0, y: 0, w: 1, h: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const e of edges) {
    minX = Math.min(minX, e.from.x, e.to.x)
    minY = Math.min(minY, e.from.y, e.to.y)
    maxX = Math.max(maxX, e.from.x, e.to.x)
    maxY = Math.max(maxY, e.from.y, e.to.y)
  }
  // Pad so curves aren't clipped at extremes.
  const pad = 60
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(1, maxX - minX + pad * 2),
    h: Math.max(1, maxY - minY + pad * 2),
  }
}

export function EdgeLayer(): JSX.Element | null {
  const { windows, edges } = useCanvas(useShallow((s) => ({ windows: s.windows, edges: s.edges })))
  const resolved = useMemo(() => {
    if (edges.length === 0) return [] as ResolvedEdge[]
    const byId = new Map(windows.map((w) => [w.id, w] as const))
    const out: ResolvedEdge[] = []
    for (const e of edges) {
      const r = resolveEdge(e, byId)
      if (r) out.push(r)
    }
    return out
  }, [edges, windows])

  if (resolved.length === 0) return null

  const b = bounds(resolved)

  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, overflow: 'visible' }}
      aria-hidden
    >
      {resolved.map((e) => (
        <path
          key={e.id}
          d={pathFor({
            ...e,
            from: { x: e.from.x - b.x, y: e.from.y - b.y },
            to: { x: e.to.x - b.x, y: e.to.y - b.y },
          })}
          stroke="var(--border)"
          strokeWidth={1.5}
          strokeDasharray={e.state === 'orphan' ? '4 4' : undefined}
          fill="none"
          opacity={e.state === 'orphan' ? 0.5 : 0.9}
        />
      ))}
    </svg>
  )
}
