import { useEffect, useRef, useState } from 'react'
import { useCanvas } from '@/state/canvas'
import { useMaximizedWindow } from '@/state/maximized-window'

export type PanModState = false | 'true' | 'dragging'

interface Args {
  hostRef: React.RefObject<HTMLDivElement | null>
  activeWorkspaceId: string | null | undefined
}

interface Handle {
  panMod: PanModState
  onViewportPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => void
}

export function useCanvasControls({ hostRef, activeWorkspaceId }: Args): Handle {
  const [panMod, setPanMod] = useState<PanModState>(false)
  // Listeners stay registered for the lifetime of the hook; panMod state
  // updates via the setter which only fires when the value actually changes.
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.key === 'Control' || ev.key === 'Meta') {
        setPanMod((prev) => (prev ? prev : 'true'))
      }
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
  }, [])

  // Wheel: zoom on Ctrl/Meta or default; pan on Shift. Skip when a window is
  // maximized — at that point the terminal owns the wheel.
  const workspaceRef = useRef(activeWorkspaceId)
  workspaceRef.current = activeWorkspaceId
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (ev: WheelEvent) => {
      const ws = workspaceRef.current
      if (ws && useMaximizedWindow.getState().byWorkspace[ws]) return
      ev.preventDefault()
      const rect = host.getBoundingClientRect()
      const vx = ev.clientX - rect.left
      const vy = ev.clientY - rect.top
      const { zoomAt, pan } = useCanvas.getState()
      if (ev.ctrlKey || ev.metaKey || !ev.shiftKey) {
        zoomAt(Math.exp(-ev.deltaY * 0.0015), vx, vy)
      } else {
        pan(-ev.deltaX, -ev.deltaY)
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [hostRef])

  // Ctrl/Cmd + 0/= /- shortcuts.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const host = hostRef.current
      const { zoomAt, resetCamera } = useCanvas.getState()
      if (ev.key === '0') {
        ev.preventDefault()
        resetCamera()
      } else if (ev.key === '=' || ev.key === '+') {
        if (!host) return
        ev.preventDefault()
        const rect = host.getBoundingClientRect()
        zoomAt(1.15, rect.width / 2, rect.height / 2)
      } else if (ev.key === '-') {
        if (!host) return
        ev.preventDefault()
        const rect = host.getBoundingClientRect()
        zoomAt(1 / 1.15, rect.width / 2, rect.height / 2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hostRef])

  const onViewportPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 && ev.button !== 1) return
    const host = hostRef.current
    if (!host) return
    const ws = workspaceRef.current
    if (ws && useMaximizedWindow.getState().byWorkspace[ws]) return
    const modHeld = ev.ctrlKey || ev.metaKey
    if (ev.target !== host && !modHeld) return
    ev.preventDefault()
    let lastX = ev.clientX
    let lastY = ev.clientY
    host.setPointerCapture(ev.pointerId)
    if (modHeld) setPanMod('dragging')
    const { pan } = useCanvas.getState()

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
  }

  return { panMod, onViewportPointerDown }
}
