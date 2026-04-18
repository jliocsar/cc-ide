import { useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCamera } from '@/hooks/use-camera'
import { useDepgraphWorker } from '@/hooks/use-depgraph-worker'
import { useGraphRenderLoop } from '@/hooks/use-graph-render-loop'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { DEFAULT_CAMERA, getFilters, getStyle, useBoardUi } from '@/state/board-ui'
import { useDepGraph } from '@/state/depgraph'
import { useDrops } from '@/state/drops'
import { useWorkspaces } from '@/state/workspaces'
import { radiusFor } from './graph-canvas-helpers'
import { GraphHoverTooltip } from './graph-hover-tooltip'
import { GraphNodeMenu } from './graph-node-menu'
import { GraphPanel } from './graph-panel'
import { GraphToolbar } from './graph-toolbar'

export function GraphCanvas(): JSX.Element {
  const workspaceId = useWorkspaces((s) => s.activeId)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    modeByWorkspace,
    graphCameraByWorkspace,
    railCollapsedByWorkspace,
    selectedNodeByWorkspace,
  } = useBoardUi(
    useShallow((s) => ({
      modeByWorkspace: s.modeByWorkspace,
      graphCameraByWorkspace: s.graphCameraByWorkspace,
      railCollapsedByWorkspace: s.railCollapsedByWorkspace,
      selectedNodeByWorkspace: s.selectedNodeByWorkspace,
    })),
  )
  const mode = workspaceId ? (modeByWorkspace[workspaceId] ?? 'sessions') : 'sessions'
  const camera = workspaceId
    ? (graphCameraByWorkspace[workspaceId] ?? DEFAULT_CAMERA)
    : DEFAULT_CAMERA
  const railCollapsed = workspaceId ? (railCollapsedByWorkspace[workspaceId] ?? false) : false
  const selectedNode = workspaceId ? (selectedNodeByWorkspace[workspaceId] ?? null) : null
  const setGraphCamera = useBoardUi((s) => s.setGraphCamera)
  const selectNode = useBoardUi((s) => s.selectNode)
  const filters = useBoardUi((s) => (workspaceId ? getFilters(s, workspaceId) : null))
  const style = useBoardUi((s) => (workspaceId ? getStyle(s, workspaceId) : null))

  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [hoverNode, setHoverNode] = useState<{ id: string; x: number; y: number } | null>(null)

  const nodes = useDepGraph((s) =>
    workspaceId ? s.byWorkspace.get(workspaceId)?.nodes : undefined,
  )
  const edges = useDepGraph((s) =>
    workspaceId ? s.byWorkspace.get(workspaceId)?.edges : undefined,
  )
  const scanning = useDepGraph((s) =>
    workspaceId ? (s.byWorkspace.get(workspaceId)?.scanning ?? false) : false,
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
    return useBoardUi.getState().graphCameraByWorkspace[workspaceId] ?? DEFAULT_CAMERA
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

  const active = Boolean(workspaceId) && mode === 'graph'
  const { positionsRef, nodeAnimRef } = useDepgraphWorker({ workspaceId, active })

  useGraphRenderLoop({
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
  })

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
    [camera, nodes, edges, style, positionsRef],
  )

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top)
      setHoverNode(hit ? { id: hit, x: ev.clientX, y: ev.clientY } : null)
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
      void invoke('shell:openPath', { absolutePath: `${ws.path}/${node.id}` })
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
  }, [setGraphCamera, workspaceId, positionsRef])

  const closeMenu = useCallback(() => setMenu(null), [])

  const currentNode = hoverNode && nodes ? (nodes.get(hoverNode.id) ?? null) : null

  const alreadyMarked = useDrops((s) =>
    workspaceId && menu
      ? (s.byWorkspace[workspaceId] ?? []).some((e) => e.relPath === menu.nodeId)
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
          <GraphHoverTooltip node={currentNode} edges={edges} x={hoverNode.x} y={hoverNode.y} />
        ) : null}

        <GraphToolbar
          workspaceId={workspaceId}
          hostRef={hostRef}
          zoomAt={cam.zoomAt}
          onFitToGraph={fitToGraph}
        />

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
        onClose={closeMenu}
      />
    </div>
  )
}
