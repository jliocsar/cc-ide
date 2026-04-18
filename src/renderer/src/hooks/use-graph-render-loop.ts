import { useEffect } from 'react'
import {
  colorFor,
  computeNodeOpacity,
  countIncoming,
  dashForKinds,
  filterVisible,
  labelFor,
  radiusFor,
  strokeForKinds,
} from '@/components/canvas/graph-canvas-helpers'
import type { LivePositions, NodeAnim } from '@/hooks/use-depgraph-worker'
import type { getFilters, getStyle } from '@/state/board-ui'
import type { Camera } from '@/state/canvas'
import type { GraphEdge, GraphNode } from '@/state/depgraph'

interface Args {
  hostRef: React.RefObject<HTMLElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  positionsRef: React.MutableRefObject<LivePositions>
  nodeAnimRef: React.MutableRefObject<Map<string, NodeAnim>>
  cameraRef: React.MutableRefObject<Camera>
  nodesRef: React.MutableRefObject<ReadonlyMap<string, GraphNode> | undefined>
  edgesRef: React.MutableRefObject<ReadonlyMap<string, GraphEdge> | undefined>
  filtersRef: React.MutableRefObject<ReturnType<typeof getFilters> | null>
  styleRef: React.MutableRefObject<ReturnType<typeof getStyle> | null>
  selectedRef: React.MutableRefObject<string | null>
  hoverRef: React.MutableRefObject<{ id: string } | null>
  active: boolean
}

export function useGraphRenderLoop({
  hostRef,
  canvasRef,
  positionsRef,
  nodeAnimRef,
  cameraRef,
  nodesRef,
  edgesRef,
  filtersRef,
  styleRef,
  selectedRef,
  hoverRef,
  active,
}: Args): void {
  useEffect(() => {
    if (!active) return
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const rect = host.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const { byIndex, indexToId } = positionsRef.current
      const cam = cameraRef.current
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const filters = filtersRef.current
      const style = styleRef.current
      const selectedNode = selectedRef.current
      const hoverNode = hoverRef.current
      if (!byIndex || !nodes || !edges || !filters || !style) return

      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(
        cam.zoom * dpr,
        0,
        0,
        cam.zoom * dpr,
        cam.x * dpr + canvas.width / 2,
        cam.y * dpr + canvas.height / 2,
      )

      const posById = new Map<string, { x: number; y: number }>()
      for (let i = 0; i < byIndex.length; i += 3) {
        const idx = byIndex[i]!
        const x = byIndex[i + 1]!
        const y = byIndex[i + 2]!
        const id = indexToId.get(idx)
        if (id) posById.set(id, { x, y })
      }

      const visible = filterVisible(nodes, edges, filters, style)

      const edgeRoute = style.mergedEdges ? 'merged' : 'perKind'
      ctx.lineWidth = 1 / cam.zoom
      for (const e of visible.edges) {
        const a = posById.get(e.from)
        const b = posById.get(e.to)
        if (!a || !b) continue
        const kinds = [...e.kinds]
        if (edgeRoute === 'merged') {
          ctx.strokeStyle = strokeForKinds(kinds)
          ctx.setLineDash(dashForKinds(kinds))
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        } else {
          for (let i = 0; i < kinds.length; i++) {
            const k = kinds[i]!
            const offset = (i - (kinds.length - 1) / 2) * 2
            const dx = b.x - a.x
            const dy = b.y - a.y
            const len = Math.max(1, Math.hypot(dx, dy))
            const px = (-dy / len) * offset
            const py = (dx / len) * offset
            ctx.strokeStyle = strokeForKinds([k])
            ctx.setLineDash(dashForKinds([k]))
            ctx.globalAlpha = 0.5
            ctx.beginPath()
            ctx.moveTo(a.x + px, a.y + py)
            ctx.lineTo(b.x + px, b.y + py)
            ctx.stroke()
          }
        }
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      const now = performance.now()
      for (const n of visible.nodes) {
        const p = posById.get(n.id)
        if (!p) continue
        const anim = nodeAnimRef.current.get(n.id)
        const opacity = computeNodeOpacity(anim, now)
        if (opacity <= 0) {
          nodeAnimRef.current.delete(n.id)
          continue
        }
        const radius = radiusFor(n, edges, style)
        ctx.globalAlpha = opacity
        ctx.fillStyle = colorFor(n, style)
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
        if (selectedNode === n.id) {
          ctx.strokeStyle = 'oklch(0.98 0 0)'
          ctx.lineWidth = 2 / cam.zoom
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      if (style.labels === 'always' || (style.labels === 'zoom' && cam.zoom >= 0.6)) {
        ctx.fillStyle = 'oklch(0.75 0 0)'
        const fontSize = Math.max(9, 11 / cam.zoom)
        ctx.font = `${fontSize}px monospace`
        ctx.textBaseline = 'middle'
        for (const n of visible.nodes) {
          const p = posById.get(n.id)
          if (!p) continue
          if (style.labels === 'zoom' && cam.zoom < 1) {
            const incomingCount = edges ? countIncoming(edges, n.id) : 0
            if (incomingCount < 3) continue
          }
          const r = radiusFor(n, edges, style)
          ctx.fillText(labelFor(n), p.x + r + 4, p.y)
        }
      } else if (style.labels === 'hover' && hoverNode) {
        const p = posById.get(hoverNode.id)
        const n = nodes?.get(hoverNode.id)
        if (p && n) {
          ctx.fillStyle = 'oklch(0.95 0 0)'
          const fontSize = Math.max(10, 12 / cam.zoom)
          ctx.font = `${fontSize}px monospace`
          ctx.textBaseline = 'middle'
          const r = radiusFor(n, edges, style)
          ctx.fillText(labelFor(n), p.x + r + 4, p.y)
        }
      }

      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [
    hostRef,
    canvasRef,
    positionsRef,
    nodeAnimRef,
    cameraRef,
    nodesRef,
    edgesRef,
    filtersRef,
    styleRef,
    selectedRef,
    hoverRef,
    active,
  ])
}
