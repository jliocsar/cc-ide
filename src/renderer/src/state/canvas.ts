import { create } from 'zustand'

export type CanvasWindow = {
  id: string
  tmuxWindow: string
  sessionId: string | null
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type Camera = { x: number; y: number; zoom: number }

export type PersistedCanvas = {
  version: 1
  camera: Camera
  windows: Array<Omit<CanvasWindow, 'sessionId'>>
  nextZ: number
}

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
  renameByTmuxWindow: (oldTmuxWindow: string, newTmuxWindow: string) => void

  pan: (dx: number, dy: number) => void
  zoomAt: (factor: number, viewportX: number, viewportY: number) => void
  resetCamera: () => void
  setCamera: (camera: Camera) => void
  panToWindow: (id: string, viewportCenter: { x: number; y: number }) => void

  hydrate: (snapshot: PersistedCanvas | null) => void
  snapshot: () => PersistedCanvas
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

export function computeCenterCamera(
  window: Pick<CanvasWindow, 'x' | 'y' | 'width' | 'height'>,
  viewportCenter: { x: number; y: number },
  zoom: number,
): Camera {
  const wx = window.x + window.width / 2
  const wy = window.y + window.height / 2
  return {
    x: viewportCenter.x - wx * zoom,
    y: viewportCenter.y - wy * zoom,
    zoom,
  }
}

const PAN_DURATION_MS = 180
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export const useCanvas = create<State>((set, get) => ({
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

  renameByTmuxWindow: (oldTmuxWindow, newTmuxWindow) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.tmuxWindow === oldTmuxWindow
          ? { ...w, tmuxWindow: newTmuxWindow, title: newTmuxWindow }
          : w,
      ),
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

  panToWindow: (id, viewportCenter) => {
    const s = get()
    const target = s.windows.find((w) => w.id === id)
    if (!target) return
    const start = s.camera
    const end = computeCenterCamera(target, viewportCenter, start.zoom)
    if (start.x === end.x && start.y === end.y) {
      s.focusWindow(id)
      return
    }
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / PAN_DURATION_MS)
      const k = easeOutCubic(t)
      set({
        camera: {
          x: start.x + (end.x - start.x) * k,
          y: start.y + (end.y - start.y) * k,
          zoom: start.zoom,
        },
      })
      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        get().focusWindow(id)
      }
    }
    requestAnimationFrame(step)
  },

  hydrate: (snapshot) => {
    if (!snapshot) {
      set({ camera: { x: 0, y: 0, zoom: 1 }, windows: [], nextZ: 1 })
      return
    }
    set({
      camera: snapshot.camera,
      windows: snapshot.windows.map((w) => ({ ...w, sessionId: null })),
      nextZ: snapshot.nextZ,
    })
  },

  snapshot: () => {
    const s = get()
    return {
      version: 1,
      camera: s.camera,
      windows: s.windows.map(({ sessionId: _ignored, ...rest }) => rest),
      nextZ: s.nextZ,
    }
  },
}))
