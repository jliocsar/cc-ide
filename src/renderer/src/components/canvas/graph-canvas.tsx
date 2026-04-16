import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Maximize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBoardUi, getFilters, getStyle, DEFAULT_CAMERA } from '@/state/board-ui'
import { useWorkspaces } from '@/state/workspaces'
import { useDepGraph, type GraphEdge, type GraphNode } from '@/state/depgraph'
import { useGraphPositions } from '@/state/graph-positions'
import { useDrops } from '@/state/drops'
import { useCamera } from '@/hooks/use-camera'
import { invoke, onEvent } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { GraphPanel } from './graph-panel'
import { GraphNodeMenu } from './graph-node-menu'
import DepgraphWorker from '@/workers/depgraph-layout.worker?worker'
import type {
  WorkerIn,
  WorkerOut,
} from '@/workers/depgraph-layout.types'

interface LivePositions {
  // Mapped by index → x/y. Index comes from the worker's idMap.
  byIndex: Float32Array | null
  idMap: Map<string, number>
  indexToId: Map<number, string>
}

export function GraphCanvas(): JSX.Element {
  const workspaceId = useWorkspaces((s) => s.activeId)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const positionsRef = useRef<LivePositions>({
    byIndex: null,
    idMap: new Map(),
    indexToId: new Map(),
  })
  const nodeAnimRef = useRef<
    Map<string, { appearAt: number; disappearAt: number | null }>
  >(new Map())

  const mode = useBoardUi((s) =>
    workspaceId ? s.modeByWorkspace[workspaceId] ?? 'sessions' : 'sessions',
  )
  const camera = useBoardUi((s) =>
    workspaceId
      ? s.graphCameraByWorkspace[workspaceId] ?? DEFAULT_CAMERA
      : DEFAULT_CAMERA,
  )
  const setGraphCamera = useBoardUi((s) => s.setGraphCamera)
  const railCollapsed = useBoardUi((s) =>
    workspaceId ? s.railCollapsedByWorkspace[workspaceId] ?? false : false,
  )
  const selectedNode = useBoardUi((s) =>
    workspaceId ? s.selectedNodeByWorkspace[workspaceId] ?? null : null,
  )
  const selectNode = useBoardUi((s) => s.selectNode)
  const filters = useBoardUi((s) =>
    workspaceId ? getFilters(s, workspaceId) : null,
  )
  const style = useBoardUi((s) =>
    workspaceId ? getStyle(s, workspaceId) : null,
  )

  const [menu, setMenu] = useState<{
    x: number
    y: number
    nodeId: string
  } | null>(null)
  const [hoverNode, setHoverNode] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  const nodes = useDepGraph((s) =>
    workspaceId ? s.byWorkspace.get(workspaceId)?.nodes : undefined,
  )
  const edges = useDepGraph((s) =>
    workspaceId ? s.byWorkspace.get(workspaceId)?.edges : undefined,
  )
  const scanning = useDepGraph((s) =>
    workspaceId ? s.byWorkspace.get(workspaceId)?.scanning ?? false : false,
  )

  // Refs mirror live state so the rAF loop never re-subscribes.
  // Without these, `hoverNode` (new object per mousemove) retears the draw
  // effect every frame → `canvas.width = ...` inside resize() clears the
  // canvas → visible flicker. See lessons.md.
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const styleRef = useRef(style)
  styleRef.current = style
  const selectedRef = useRef(selectedNode)
  selectedRef.current = selectedNode
  const hoverRef = useRef(hoverNode)
  hoverRef.current = hoverNode

  // Camera binding for the hook — read fresh from the store each call.
  // A closure over `camera` here goes stale during pointer-drag: the `move`
  // handler in use-camera captures this function at pointer-down time, and
  // without a fresh read every call, pan deltas all apply to the initial
  // camera → position oscillates instead of accumulating.
  const getCamera = useCallback(() => {
    if (!workspaceId) return DEFAULT_CAMERA
    return (
      useBoardUi.getState().graphCameraByWorkspace[workspaceId] ??
      DEFAULT_CAMERA
    )
  }, [workspaceId])
  const setCamera = useCallback(
    (next: typeof camera) => {
      if (!workspaceId) return
      setGraphCamera(workspaceId, next)
    },
    [workspaceId, setGraphCamera],
  )
  const cam = useCamera({
    hostRef: hostRef as React.RefObject<HTMLElement>,
    getCamera,
    setCamera,
  })

  // ──────────────── Worker + subscription lifecycle ────────────────
  //
  // The worker is the source of truth for positions. Snapshot events re-init
  // the worker's sim wholesale; delta events apply incremental diffs. We do
  // NOT re-derive the worker state from the zustand store — that would thrash
  // on every render. The store mirrors the same sequence just for rendering.

  useEffect(() => {
    if (!workspaceId || mode !== 'graph') return

    let cancelled = false
    const worker = new DepgraphWorker()
    workerRef.current = worker
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data
      if (msg.type === 'idMap') {
        const nextIdMap = new Map<string, number>()
        const nextReverse = new Map<number, string>()
        for (const m of msg.mapping) {
          nextIdMap.set(m.id, m.index)
          nextReverse.set(m.index, m.id)
        }
        positionsRef.current = {
          byIndex: positionsRef.current.byIndex,
          idMap: nextIdMap,
          indexToId: nextReverse,
        }
      } else if (msg.type === 'tick') {
        positionsRef.current = {
          ...positionsRef.current,
          byIndex: msg.positions,
        }
      }
    }

    const ingestSnapshot = useDepGraph.getState().ingestSnapshot
    const ingestDelta = useDepGraph.getState().ingestDelta
    const setScanProgress = useDepGraph.getState().setScanProgress
    const setScanEnd = useDepGraph.getState().setScanEnd

    const offSnap = onEvent('graph:snapshot', (snap) => {
      if (cancelled) return
      if (snap.workspaceId !== workspaceId) return
      ingestSnapshot(snap)
      const seedMap = useGraphPositions.getState().get(workspaceId)
      const seeds = seedMap
        ? [...seedMap.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }))
        : undefined
      worker.postMessage({
        type: 'init',
        nodes: snap.nodes,
        edges: snap.edges.map((e) => ({
          from: e.from,
          to: e.to,
          kinds: e.kinds,
        })),
        seedPositions: seeds,
      } satisfies WorkerIn)
    })
    const offDelta = onEvent('graph:delta', ({ workspaceId: wsId, delta }) => {
      if (cancelled) return
      if (wsId !== workspaceId) return
      const now = performance.now()
      if (delta.addNodes) {
        for (const n of delta.addNodes) {
          nodeAnimRef.current.set(n.id, { appearAt: now, disappearAt: null })
        }
      }
      if (delta.removeNodes) {
        for (const id of delta.removeNodes) {
          const anim = nodeAnimRef.current.get(id)
          if (anim) anim.disappearAt = now
          else
            nodeAnimRef.current.set(id, {
              appearAt: now - 9999,
              disappearAt: now,
            })
        }
      }
      ingestDelta(wsId, delta)
      worker.postMessage({
        type: 'delta',
        addNodes: delta.addNodes,
        removeNodes: delta.removeNodes,
        addEdges: delta.addEdges?.map((e) => ({
          from: e.from,
          to: e.to,
          kinds: e.kinds,
        })),
        removeEdges: delta.removeEdges,
        updateEdgeKinds: delta.updateEdgeKinds?.map((e) => ({
          from: e.from,
          to: e.to,
          kinds: e.kinds,
        })),
      } satisfies WorkerIn)
    })
    const offProgress = onEvent('graph:scanProgress', ({ workspaceId: w, filesScanned }) => {
      if (w !== workspaceId) return
      setScanProgress(w, filesScanned)
    })
    const offEnd = onEvent('graph:scanEnd', ({ workspaceId: w, finalNodeCount, finalEdgeCount }) => {
      if (w !== workspaceId) return
      setScanEnd(w, finalNodeCount, finalEdgeCount)
    })

    void invoke('graph:subscribe', { workspaceId })

    return () => {
      cancelled = true
      offSnap()
      offDelta()
      offProgress()
      offEnd()
      void invoke('graph:unsubscribe', { workspaceId }).catch(() => {})
      useDepGraph.getState().clearWorkspace(workspaceId)
      worker.postMessage({ type: 'stop' } satisfies WorkerIn)
      worker.terminate()
      workerRef.current = null
    }
  }, [workspaceId, mode])

  // ──────────────── Camera-resize + rAF render loop ────────────────

  useEffect(() => {
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

      // Clear.
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply camera + dpr.
      ctx.setTransform(
        cam.zoom * dpr,
        0,
        0,
        cam.zoom * dpr,
        cam.x * dpr + canvas.width / 2,
        cam.y * dpr + canvas.height / 2,
      )

      // Build position lookup for current frame.
      const posById = new Map<string, { x: number; y: number }>()
      for (let i = 0; i < byIndex.length; i += 3) {
        const idx = byIndex[i]!
        const x = byIndex[i + 1]!
        const y = byIndex[i + 2]!
        const id = indexToId.get(idx)
        if (id) posById.set(id, { x, y })
      }

      const visible = filterVisible(nodes, edges, filters, style)

      // Edges first.
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

      // Nodes.
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

      // Labels (zoom threshold or always or hover).
      if (style.labels === 'always' || (style.labels === 'zoom' && cam.zoom >= 0.6)) {
        ctx.fillStyle = 'oklch(0.75 0 0)'
        const fontSize = Math.max(9, 11 / cam.zoom)
        ctx.font = `${fontSize}px monospace`
        ctx.textBaseline = 'middle'
        for (const n of visible.nodes) {
          const p = posById.get(n.id)
          if (!p) continue
          if (style.labels === 'zoom' && cam.zoom < 1) {
            // only label high-degree nodes below full zoom
            const incomingCount = edges
              ? countIncoming(edges, n.id)
              : 0
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
  }, [workspaceId, mode])

  // ──────────────── Hit-testing / interactions ────────────────

  const hitTest = useCallback(
    (viewportX: number, viewportY: number): string | null => {
      const host = hostRef.current
      if (!host || !nodes) return null
      const rect = host.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const worldX = (viewportX - cx - camera.x) / camera.zoom
      const worldY = (viewportY - cy - camera.y) / camera.zoom
      const { byIndex, indexToId } = positionsRef.current
      if (!byIndex) return null
      const hitR = 12 / camera.zoom
      let best: { id: string; dist: number } | null = null
      for (let i = 0; i < byIndex.length; i += 3) {
        const idx = byIndex[i]!
        const id = indexToId.get(idx)
        if (!id) continue
        const node = nodes.get(id)
        if (!node) continue
        const nx = byIndex[i + 1]!
        const ny = byIndex[i + 2]!
        const d = Math.hypot(nx - worldX, ny - worldY)
        const r = radiusFor(node, edges, style!) + 4 / camera.zoom
        if (d <= Math.max(hitR, r) && (!best || d < best.dist)) {
          best = { id, dist: d }
        }
      }
      return best?.id ?? null
    },
    [camera, nodes, edges, style],
  )

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top)
      if (hit) {
        setHoverNode({ id: hit, x: ev.clientX, y: ev.clientY })
      } else {
        setHoverNode(null)
      }
    },
    [hitTest],
  )

  const onClick = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      if (!workspaceId) return
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top)
      selectNode(workspaceId, hit)
    },
    [hitTest, selectNode, workspaceId],
  )

  const onDoubleClick = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      const host = hostRef.current
      if (!host || !workspaceId || !nodes) return
      const rect = host.getBoundingClientRect()
      const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top)
      if (!hit) return
      const node = nodes.get(hit)
      if (!node || node.kind !== 'file') return
      const ws = useWorkspaces.getState().workspaces.find((w) => w.id === workspaceId)
      if (!ws) return
      const absPath = `${ws.path}/${node.id}`
      void invoke('shell:openPath', { absolutePath: absPath })
    },
    [hitTest, workspaceId, nodes],
  )

  const onContextMenu = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top)
      if (!hit) return
      ev.preventDefault()
      setMenu({ x: ev.clientX, y: ev.clientY, nodeId: hit })
    },
    [hitTest],
  )

  // Drag start from graph: the Drops-sidebar handles the real drag source,
  // but we can allow drag-from-hover for files as a convenience. Future work.

  // ──────────────── Toolbar actions ────────────────

  const fitToGraph = useCallback(() => {
    if (!workspaceId) return
    const { byIndex } = positionsRef.current
    if (!byIndex || byIndex.length === 0) return
    const host = hostRef.current
    if (!host) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < byIndex.length; i += 3) {
      const x = byIndex[i + 1]!
      const y = byIndex[i + 2]!
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const w = maxX - minX || 100
    const h = maxY - minY || 100
    const rect = host.getBoundingClientRect()
    const zoom = Math.min(1.0, Math.min(rect.width / (w + 100), rect.height / (h + 100)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setGraphCamera(workspaceId, { x: -cx * zoom, y: -cy * zoom, zoom })
  }, [setGraphCamera, workspaceId])

  // ──────────────── Render ────────────────

  const currentNode = useMemo(() => {
    if (!hoverNode || !nodes) return null
    return nodes.get(hoverNode.id) ?? null
  }, [hoverNode, nodes])

  const alreadyMarked = useDrops((s) =>
    workspaceId && menu
      ? (s.byWorkspace[workspaceId] ?? []).some(
          (e) => e.relPath === menu.nodeId,
        )
      : false,
  )

  // NOTE: we only early-return when workspaceId is absent. We do NOT
  // early-return on `mode !== 'graph'` — BoardView keeps both canvases mounted
  // and hides the inactive one. Unmounting the host here would invalidate
  // `hostRef.current` mid-life, and useCamera's wheel listener (attached once
  // in an effect with stable deps) would end up bound to a dead DOM node →
  // zoom breaks after the first mode flip.
  if (!workspaceId || !filters || !style) {
    return <div className="h-full w-full bg-background" />
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] bg-background',
        railCollapsed ? 'grid-cols-[1fr_32px]' : 'grid-cols-[1fr_360px]',
      )}
    >
      <div
        ref={hostRef}
        onPointerDown={cam.onViewportPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className="relative min-h-0 overflow-hidden bg-background"
        style={{ touchAction: 'none' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)',
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

        {hoverNode && currentNode ? (
          <GraphHoverTooltip
            node={currentNode}
            edges={edges}
            x={hoverNode.x}
            y={hoverNode.y}
          />
        ) : null}

        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => {
              const host = hostRef.current
              if (!host) return
              const rect = host.getBoundingClientRect()
              cam.zoomAt(1 / 1.15, rect.width / 2, rect.height / 2)
            }}
            aria-label="Zoom out"
          >
            <Minus />
          </Button>
          <span className="min-w-10 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(camera.zoom * 100)}%
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => {
              const host = hostRef.current
              if (!host) return
              const rect = host.getBoundingClientRect()
              cam.zoomAt(1.15, rect.width / 2, rect.height / 2)
            }}
            aria-label="Zoom in"
          >
            <Plus />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={fitToGraph} aria-label="Fit to graph">
            <Maximize2 />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => invoke('graph:refresh', { workspaceId })}
            aria-label="Rescan"
          >
            <RefreshCw />
          </Button>
        </div>

        {scanning ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-card/80 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            scanning…
          </div>
        ) : null}
      </div>

      <GraphPanel workspaceId={workspaceId} />

      <GraphNodeMenu
        menu={menu}
        workspaceId={workspaceId}
        alreadyMarked={alreadyMarked}
        onClose={() => setMenu(null)}
      />
    </div>
  )
}

function GraphHoverTooltip({
  node,
  edges,
  x,
  y,
}: {
  node: GraphNode
  edges: ReadonlyMap<string, GraphEdge> | undefined
  x: number
  y: number
}): JSX.Element {
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

// ──────────────── Filtering ────────────────

function filterVisible(
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
    // edge-kind filter check first (affects counts)
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
  // Minimal glob: support `**` and `*`. For scaffold; can upgrade later.
  const esc = pattern
    .split('**')
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*'),
    )
    .join('.*')
  const re = new RegExp(`^${esc}$`)
  return re.test(path)
}

// ──────────────── Styling helpers ────────────────

function radiusFor(
  n: GraphNode,
  edges: ReadonlyMap<string, GraphEdge> | undefined,
  style: ReturnType<typeof getStyle>,
): number {
  if (style.nodeSize === 'fixed') return 4
  if (style.nodeSize === 'loc')
    return Math.max(3, Math.min(14, Math.log2((n.loc ?? 10) + 1) * 1.5))
  // degree
  let d = 0
  if (edges) {
    for (const e of edges.values()) {
      if (e.to === n.id) d++
      if (e.from === n.id) d++
    }
  }
  return Math.max(3, Math.min(12, 3 + Math.log2(d + 1) * 1.6))
}

function colorFor(n: GraphNode, style: ReturnType<typeof getStyle>): string {
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
  // folder — hash the top-level dir
  const top = n.id.split('/')[0] ?? n.id
  return folderColor(top)
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

function strokeForKinds(kinds: string[]): string {
  // asset = very light; type = dim; dynamic = warm; static/reexport = neutral
  if (kinds.includes('asset')) return 'oklch(0.45 0 0)'
  if (kinds.includes('dynamic')) return 'oklch(0.68 0.1 60)'
  if (kinds.includes('type')) return 'oklch(0.55 0 0)'
  return 'oklch(0.70 0 0)'
}

function dashForKinds(kinds: string[]): number[] {
  if (kinds.includes('type')) return [3, 3]
  if (kinds.includes('dynamic')) return [2, 2]
  if (kinds.includes('asset')) return [1, 3]
  return []
}

function countIncoming(
  edges: ReadonlyMap<string, GraphEdge>,
  id: string,
): number {
  let n = 0
  for (const e of edges.values()) if (e.to === id) n++
  return n
}

function countOutgoing(
  edges: ReadonlyMap<string, GraphEdge>,
  id: string,
): number {
  let n = 0
  for (const e of edges.values()) if (e.from === id) n++
  return n
}

function labelFor(n: GraphNode): string {
  if (n.kind === 'external') return n.external?.packageName ?? n.id
  const parts = n.id.split('/')
  return parts[parts.length - 1] ?? n.id
}

function computeNodeOpacity(
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

