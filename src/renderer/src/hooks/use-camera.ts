import { useCallback, useEffect } from 'react'
import type { Camera } from '@/state/canvas'

const ZOOM_MIN = 0.3
const ZOOM_MAX = 2.5

export interface UseCameraArgs {
  hostRef: React.RefObject<HTMLElement>
  getCamera: () => Camera
  setCamera: (next: Camera) => void
  /** When true, hooks into window-level Ctrl+0/= /- shortcuts. Defaults to false. */
  captureKeyboard?: boolean
}

export interface UseCameraHandle {
  onViewportPointerDown: (ev: React.PointerEvent<HTMLElement>) => void
  worldFromViewport: (x: number, y: number) => { x: number; y: number }
  zoomAt: (factor: number, viewportX: number, viewportY: number) => void
  pan: (dx: number, dy: number) => void
  resetCamera: () => void
}

export function useCamera({
  hostRef,
  getCamera,
  setCamera,
  captureKeyboard = false,
}: UseCameraArgs): UseCameraHandle {
  const worldFromViewport = useCallback(
    (viewportX: number, viewportY: number) => {
      const c = getCamera()
      return {
        x: (viewportX - c.x) / c.zoom,
        y: (viewportY - c.y) / c.zoom,
      }
    },
    [getCamera],
  )

  const zoomAt = useCallback(
    (factor: number, viewportX: number, viewportY: number) => {
      const c = getCamera()
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * factor))
      if (next === c.zoom) return
      const w = {
        x: (viewportX - c.x) / c.zoom,
        y: (viewportY - c.y) / c.zoom,
      }
      setCamera({
        zoom: next,
        x: viewportX - w.x * next,
        y: viewportY - w.y * next,
      })
    },
    [getCamera, setCamera],
  )

  const pan = useCallback(
    (dx: number, dy: number) => {
      const c = getCamera()
      setCamera({ ...c, x: c.x + dx, y: c.y + dy })
    },
    [getCamera, setCamera],
  )

  const resetCamera = useCallback(() => setCamera({ x: 0, y: 0, zoom: 1 }), [setCamera])

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
  }, [hostRef, zoomAt, pan])

  useEffect(() => {
    if (!captureKeyboard) return
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
  }, [captureKeyboard, hostRef, zoomAt, resetCamera])

  const onViewportPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLElement>) => {
      if (ev.button !== 0 && ev.button !== 1) return
      const host = hostRef.current
      if (!host) return
      if (ev.target !== host) return
      let lastX = ev.clientX
      let lastY = ev.clientY
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
    [hostRef, pan],
  )

  return { onViewportPointerDown, worldFromViewport, zoomAt, pan, resetCamera }
}
