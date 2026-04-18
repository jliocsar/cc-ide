import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useCanvasControls } from '@/hooks/use-canvas-controls'
import { setCanvasHost } from '@/lib/canvas-host'
import { useCanvas } from '@/state/canvas'
import { useSpawnModal } from '@/state/spawn-modal'
import { useWorkspaces } from '@/state/workspaces'
import { CanvasContextMenu, type ContextMenuState } from './canvas-context-menu'
import { XtermWindow } from './xterm-window'
import { ZoomControls } from './zoom-controls'

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const { camera, windows } = useCanvas(
    useShallow((s) => ({ camera: s.camera, windows: s.windows })),
  )

  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const { panMod, onViewportPointerDown } = useCanvasControls({ hostRef, activeWorkspaceId })

  useEffect(() => {
    setCanvasHost(hostRef.current)
    return () => setCanvasHost(null)
  }, [])

  const spawnFromToolbar = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    openSpawnModal({ x: rect.width / 2, y: rect.height / 2 })
  }, [openSpawnModal])

  const onContextMenu = useCallback((ev: React.MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    if (ev.target !== host) return
    ev.preventDefault()
    const rect = host.getBoundingClientRect()
    setMenu({
      x: ev.clientX,
      y: ev.clientY,
      vp: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
    })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])
  const spawnFromMenu = useCallback(
    (vp: { x: number; y: number }) => openSpawnModal(vp),
    [openSpawnModal],
  )

  const hasWindows = windows.length > 0
  const canSpawn = Boolean(activeWorkspaceId)

  return (
    <div
      ref={hostRef}
      onPointerDown={onViewportPointerDown}
      onContextMenu={onContextMenu}
      className="relative overflow-hidden bg-background"
      data-pan-mod={panMod || undefined}
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

      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
        }}
      >
        {windows.map((w) => (
          <XtermWindow key={w.id} w={w} />
        ))}
      </div>

      {!hasWindows ? (
        <EmptyState
          canSpawn={canSpawn}
          spawnDisabled={modalOpen}
          onSpawn={spawnFromToolbar}
        />
      ) : null}

      <ZoomControls
        hostRef={hostRef}
        zoomPercent={Math.round(camera.zoom * 100)}
        onSpawn={spawnFromToolbar}
        spawnDisabled={modalOpen || !canSpawn}
      />

      <CanvasContextMenu
        menu={menu}
        canSpawn={canSpawn}
        spawnDisabled={modalOpen}
        onClose={closeMenu}
        onSpawn={spawnFromMenu}
      />
    </div>
  )
}

function EmptyState({
  canSpawn,
  spawnDisabled,
  onSpawn,
}: {
  canSpawn: boolean
  spawnDisabled: boolean
  onSpawn: () => void
}): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <div className="font-mono text-xs text-muted-foreground">empty canvas</div>
        <Button size="sm" onClick={onSpawn} disabled={spawnDisabled || !canSpawn}>
          Spawn Claude
        </Button>
        {!canSpawn ? (
          <div className="font-mono text-[11px] text-muted-foreground">
            pick a workspace from the sidebar
          </div>
        ) : null}
      </div>
    </div>
  )
}
