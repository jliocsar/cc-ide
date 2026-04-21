import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useAgentEvents } from '@/hooks/use-agent-events'
import { useCanvasControls } from '@/hooks/use-canvas-controls'
import { setCanvasHost } from '@/lib/canvas-host'
import { useCanvas } from '@/state/canvas'
import { useMaximizedWindow } from '@/state/maximized-window'
import { useSpawnModal } from '@/state/spawn-modal'
import { useWorkspaces } from '@/state/workspaces'
import { CanvasContextMenu, type ContextMenuState } from './canvas-context-menu'
import { EdgeLayer } from './edge-layer'
import { SubagentWindow } from './subagent-window'
import { XtermWindow } from './xterm-window'
import { ZoomControls } from './zoom-controls'

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { camera, windows } = useCanvas(
    useShallow((s) => ({ camera: s.camera, windows: s.windows })),
  )

  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)

  useAgentEvents()

  const maximizedWindowId = useMaximizedWindow((s) =>
    activeWorkspaceId ? (s.byWorkspace[activeWorkspaceId] ?? null) : null,
  )
  const setMaximizedWindow = useMaximizedWindow((s) => s.set)
  const paged = maximizedWindowId !== null

  const pagedWindows = useMemo(() => {
    if (!paged) return windows
    return [...windows].sort((a, b) => a.x - b.x || a.y - b.y)
  }, [paged, windows])

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const { panMod, onViewportPointerDown } = useCanvasControls({ hostRef, activeWorkspaceId })

  useEffect(() => {
    setCanvasHost(hostRef.current)
    return () => setCanvasHost(null)
  }, [])

  // On entering paged mode, snap-scroll to the maximized window. We
  // intentionally run only when `paged` flips — the windowId is updated
  // by the scroll listener below, and we don't want to yank the scroll
  // position back on every user swipe.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!paged) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-window-id="${CSS.escape(maximizedWindowId ?? '')}"]`,
    )
    if (!target) return
    scroller.scrollTo({ left: target.offsetLeft, behavior: 'auto' })
  }, [paged])

  // As the user scrolls, update the maximized windowId to whatever page
  // is centered — so the header bar + restore always track what you see.
  useEffect(() => {
    if (!paged || !activeWorkspaceId) return
    const scroller = scrollerRef.current
    if (!scroller) return
    let raf = 0
    const pickCentered = (): void => {
      raf = 0
      const center = scroller.scrollLeft + scroller.clientWidth / 2
      let bestId: string | null = null
      let bestDist = Infinity
      for (const el of scroller.querySelectorAll<HTMLElement>('[data-window-id]')) {
        const mid = el.offsetLeft + el.offsetWidth / 2
        const d = Math.abs(mid - center)
        if (d < bestDist) {
          bestDist = d
          bestId = el.dataset.windowId ?? null
        }
      }
      if (bestId && bestId !== maximizedWindowId) {
        setMaximizedWindow(activeWorkspaceId, bestId)
      }
    }
    const onScroll = (): void => {
      if (raf) return
      raf = requestAnimationFrame(pickCentered)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [paged, activeWorkspaceId, maximizedWindowId, setMaximizedWindow])

  // Page-step navigation in paged mode. Bound to Ctrl+wheel and
  // Ctrl+Shift+Arrow. We animate scrollLeft by hand with easeInOutCubic —
  // native `behavior: 'smooth'` is short and snap-type mandatory
  // collapses it into a jump. macOS-workspaces feel: ~460ms ease.
  useEffect(() => {
    if (!paged) return
    const scroller = scrollerRef.current
    if (!scroller) return
    let cooldown = 0
    let raf = 0
    const ANIM_MS = 260
    const ease = (t: number): number => 1 - (1 - t) ** 3
    const animateTo = (target: number): void => {
      if (raf) cancelAnimationFrame(raf)
      const start = scroller.scrollLeft
      const delta = target - start
      if (delta === 0) return
      scroller.style.scrollSnapType = 'none'
      const t0 = performance.now()
      const step = (now: number): void => {
        const t = Math.min(1, (now - t0) / ANIM_MS)
        scroller.scrollLeft = start + delta * ease(t)
        if (t < 1) {
          raf = requestAnimationFrame(step)
        } else {
          raf = 0
          scroller.style.scrollSnapType = ''
        }
      }
      raf = requestAnimationFrame(step)
    }
    const stepPage = (dir: 1 | -1): void => {
      const now = performance.now()
      if (now < cooldown) return
      const pages = Array.from(scroller.querySelectorAll<HTMLElement>('[data-window-id]'))
      if (pages.length === 0) return
      const center = scroller.scrollLeft + scroller.clientWidth / 2
      let currentIdx = 0
      let bestDist = Infinity
      pages.forEach((el, i) => {
        const mid = el.offsetLeft + el.offsetWidth / 2
        const d = Math.abs(mid - center)
        if (d < bestDist) {
          bestDist = d
          currentIdx = i
        }
      })
      const nextIdx = Math.max(0, Math.min(pages.length - 1, currentIdx + dir))
      if (nextIdx === currentIdx) return
      const target = pages[nextIdx]
      if (!target) return
      cooldown = now + ANIM_MS
      animateTo(target.offsetLeft)
    }
    const onWheel = (ev: WheelEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      ev.preventDefault()
      ev.stopPropagation()
      const delta = ev.deltaY + ev.deltaX
      if (delta === 0) return
      stepPage(delta > 0 ? 1 : -1)
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (!ev.shiftKey || ev.altKey) return
      if (ev.key === 'ArrowRight') {
        ev.preventDefault()
        ev.stopPropagation()
        stepPage(1)
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault()
        ev.stopPropagation()
        stepPage(-1)
      }
    }
    scroller.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      scroller.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions)
      if (raf) cancelAnimationFrame(raf)
      scroller.style.scrollSnapType = ''
    }
  }, [paged])

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
      {!paged && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)',
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        />
      )}

      {/* One stable container — swap class/style only, so XtermWindow
          instances (and their xterm Terminals) are preserved across
          paged <-> free transitions. */}
      <div
        ref={scrollerRef}
        className={
          paged
            ? 'scrollbar-none absolute inset-0 flex overflow-x-auto overflow-y-hidden [scroll-snap-type:x_mandatory]'
            : 'absolute left-0 top-0 origin-top-left'
        }
        style={
          paged
            ? undefined
            : {
                transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
              }
        }
      >
        {!paged && <EdgeLayer />}
        {(paged ? pagedWindows : windows).map((w) =>
          (w.kind ?? 'claude') === 'subagent' ? (
            <SubagentWindow key={w.id} w={w} />
          ) : (
            <XtermWindow key={w.id} w={w} />
          ),
        )}
      </div>

      {!hasWindows ? (
        <EmptyState canSpawn={canSpawn} spawnDisabled={modalOpen} onSpawn={spawnFromToolbar} />
      ) : null}

      {!paged && (
        <ZoomControls
          hostRef={hostRef}
          zoomPercent={Math.round(camera.zoom * 100)}
          onSpawn={spawnFromToolbar}
          spawnDisabled={modalOpen || !canSpawn}
        />
      )}

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
