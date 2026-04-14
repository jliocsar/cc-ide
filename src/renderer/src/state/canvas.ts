import { create } from 'zustand'

export type CanvasWindow = {
  id: string
  sessionId: string
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type Camera = { x: number; y: number; zoom: number }

const ZOOM_MIN = 0.3
const ZOOM_MAX = 2.5

type State = {
  camera: Camera
  windows: CanvasWindow[]
  nextZ: number

  addWindow: (init: Omit<CanvasWindow, 'zIndex'>) => void
  removeWindow: (id: string) => void
  updateWindow: (id: string, patch: Partial<CanvasWindow>) => void
  focusWindow: (id: string) => void

  pan: (dx: number, dy: number) => void
  zoomAt: (factor: number, viewportX: number, viewportY: number) => void
  resetCamera: () => void
  setCamera: (camera: Camera) => void
}

export function worldFromViewport(
  viewportX: number,
  viewportY: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (viewportX - camera.x) / camera.zoom,
    y: (viewportY - camera.y) / camera.zoom,
  }
}

export const useCanvas = create<State>((set) => ({
  camera: { x: 0, y: 0, zoom: 1 },
  windows: [],
  nextZ: 1,

  addWindow: (init) =>
    set((s) => ({
      windows: [...s.windows, { ...init, zIndex: s.nextZ }],
      nextZ: s.nextZ + 1,
    })),

  removeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  updateWindow: (id, patch) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),

  focusWindow: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, zIndex: s.nextZ } : w)),
      nextZ: s.nextZ + 1,
    })),

  pan: (dx, dy) =>
    set((s) => ({ camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy } })),

  zoomAt: (factor, viewportX, viewportY) =>
    set((s) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.camera.zoom * factor))
      if (next === s.camera.zoom) return s
      const world = worldFromViewport(viewportX, viewportY, s.camera)
      return {
        camera: {
          zoom: next,
          x: viewportX - world.x * next,
          y: viewportY - world.y * next,
        },
      }
    }),

  resetCamera: () => set({ camera: { x: 0, y: 0, zoom: 1 } }),
  setCamera: (camera) => set({ camera }),
}))
