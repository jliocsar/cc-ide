import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { useCanvas } from '@/state/canvas'
import { useWorkspaces } from '@/state/workspaces'
import { useSpawnModal } from '@/state/spawn-modal'
import { useMaximizedWindow } from '@/state/maximized-window'
import { setCanvasHost } from '@/lib/canvas-host'
import { XtermWindow } from './xterm-window'

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const camera = useCanvas((s) => s.camera)
  const windows = useCanvas((s) => s.windows)
  const pan = useCanvas((s) => s.pan)
  const zoomAt = useCanvas((s) => s.zoomAt)
  const resetCamera = useCanvas((s) => s.resetCamera)

  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)

  const [menu, setMenu] = useState<{ x: number; y: number; vp: { x: number; y: number } } | null>(
    null,
  )
  const [panMod, setPanMod] = useState<false | 'true' | 'dragging'>(false)
  const hasMaximized = useMaximizedWindow((s) =>
    activeWorkspaceId
      ? s.byWorkspace[activeWorkspaceId] !== null && s.byWorkspace[activeWorkspaceId] !== undefined
      : false,
  )

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if ((ev.key === 'Control' || ev.key === 'Meta') && !panMod) setPanMod('true')
    }
    const up = (ev: KeyboardEvent) => {
      if (ev.key === 'Control' || ev.key === 'Meta') setPanMod(false)
    }
    const blur = () => setPanMod(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [panMod])

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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (ev: WheelEvent) => {
      if (useMaximizedWindow.getState().byWorkspace[activeWorkspaceId ?? '']) return
      ev.preventDefault()
      const rect = host.getBoundingClientRect()
      const vx = ev.clientX - rect.left
      const vy = ev.clientY - rect.top
      if (ev.ctrlKey || ev.metaKey || !ev.shiftKey) {
        const factor = Math.exp(-ev.deltaY * 0.0015)
        zoomAt(factor, vx, vy)
      } else {
        pan(-ev.deltaX, -ev.deltaY)
      }
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [zoomAt, pan])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (ev.key === '0') {
        ev.preventDefault()
        resetCamera()
      } else if (ev.key === '=' || ev.key === '+') {
        ev.preventDefault()
        const host = hostRef.current
        if (!host) return
        const rect = host.getBoundingClientRect()
        zoomAt(1.15, rect.width / 2, rect.height / 2)
      } else if (ev.key === '-') {
        ev.preventDefault()
        const host = hostRef.current
        if (!host) return
        const rect = host.getBoundingClientRect()
        zoomAt(1 / 1.15, rect.width / 2, rect.height / 2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomAt, resetCamera])

  const onViewportPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0 && ev.button !== 1) return
      const host = hostRef.current
      if (!host) return
      if (hasMaximized) return
      const modHeld = ev.ctrlKey || ev.metaKey
      if (ev.target !== host && !modHeld) return
      ev.preventDefault()
      const startX = ev.clientX
      const startY = ev.clientY
      let lastX = startX
      let lastY = startY
      host.setPointerCapture(ev.pointerId)
      if (modHeld) setPanMod('dragging')

      const move = (e: PointerEvent) => {
        pan(e.clientX - lastX, e.clientY - lastY)
        lastX = e.clientX
        lastY = e.clientY
      }
      const up = (e: PointerEvent) => {
        host.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (modHeld) {
          setPanMod(e.ctrlKey || e.metaKey ? 'true' : false)
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [pan],
  )

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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <div className="font-mono text-xs text-muted-foreground">empty canvas</div>
            <Button size="sm" onClick={spawnFromToolbar} disabled={modalOpen || !canSpawn}>
              Spawn Claude
            </Button>
            {!canSpawn ? (
              <div className="font-mono text-[11px] text-muted-foreground">
                pick a workspace from the sidebar
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            const host = hostRef.current
            if (!host) return
            const rect = host.getBoundingClientRect()
            zoomAt(1 / 1.15, rect.width / 2, rect.height / 2)
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
            zoomAt(1.15, rect.width / 2, rect.height / 2)
          }}
          aria-label="Zoom in"
        >
          <Plus />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={resetCamera} aria-label="Reset camera">
          <Maximize2 />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={spawnFromToolbar}
          disabled={modalOpen || !canSpawn}
          aria-label="Spawn Claude"
        >
          <Plus />
        </Button>
      </div>

      <DropdownMenu
        open={menu !== null}
        onOpenChange={(v) => {
          if (!v) setMenu(null)
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            style={{
              position: 'fixed',
              left: menu?.x ?? 0,
              top: menu?.y ?? 0,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0}>
          <DropdownMenuItem
            disabled={!canSpawn || modalOpen}
            onClick={() => {
              if (!menu) return
              openSpawnModal(menu.vp)
              setMenu(null)
            }}
          >
            <Plus />
            New session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
