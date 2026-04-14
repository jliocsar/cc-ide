import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { useCanvas, worldFromViewport } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'
import { XtermWindow } from './xterm-window'

const DEFAULT_WIN_W = 720
const DEFAULT_WIN_H = 440

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const camera = useCanvas((s) => s.camera)
  const windows = useCanvas((s) => s.windows)
  const pan = useCanvas((s) => s.pan)
  const zoomAt = useCanvas((s) => s.zoomAt)
  const resetCamera = useCanvas((s) => s.resetCamera)
  const addWindow = useCanvas((s) => s.addWindow)

  const spawnSession = useSessions((s) => s.spawn)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const [spawning, setSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spawnAt = useCallback(
    async (viewportCenter: { x: number; y: number }) => {
      if (!activeWorkspaceId) {
        setError('Add a workspace first.')
        return
      }
      setSpawning(true)
      setError(null)
      try {
        const { ptyId, tmuxWindow } = await spawnSession(activeWorkspaceId, 120, 30)
        const { camera: cam } = useCanvas.getState()
        const world = worldFromViewport(viewportCenter.x, viewportCenter.y, cam)
        addWindow({
          id: crypto.randomUUID(),
          sessionId: ptyId,
          tmuxWindow,
          title: tmuxWindow,
          x: world.x - DEFAULT_WIN_W / 2,
          y: world.y - DEFAULT_WIN_H / 2,
          width: DEFAULT_WIN_W,
          height: DEFAULT_WIN_H,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSpawning(false)
      }
    },
    [activeWorkspaceId, spawnSession, addWindow],
  )

  const spawnFromToolbar = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    void spawnAt({ x: rect.width / 2, y: rect.height / 2 })
  }, [spawnAt])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (ev: WheelEvent) => {
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
      if (ev.target !== host) return
      const startX = ev.clientX
      const startY = ev.clientY
      let lastX = startX
      let lastY = startY
      host.setPointerCapture(ev.pointerId)

      const move = (e: PointerEvent) => {
        pan(e.clientX - lastX, e.clientY - lastY)
        lastX = e.clientX
        lastY = e.clientY
      }
      const up = (e: PointerEvent) => {
        host.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [pan],
  )

  const hasWindows = windows.length > 0
  const canSpawn = Boolean(activeWorkspaceId)

  return (
    <div
      ref={hostRef}
      onPointerDown={onViewportPointerDown}
      className="relative overflow-hidden bg-background"
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
            <Button size="sm" onClick={spawnFromToolbar} disabled={spawning || !canSpawn}>
              {spawning ? 'spawning…' : 'Spawn Claude'}
            </Button>
            {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
            {!canSpawn ? (
              <div className="font-mono text-[11px] text-muted-foreground">pick a workspace from the sidebar</div>
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
          disabled={spawning || !canSpawn}
          aria-label="Spawn Claude"
        >
          <Plus />
        </Button>
      </div>

      {error && hasWindows ? (
        <div className="absolute left-3 bottom-3 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 font-mono text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}
