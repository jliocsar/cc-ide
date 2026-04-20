import { create } from 'zustand'

// Only the windowId is stored. Titles/badges/etc. are derived at render
// time from the canvas + sessions stores, so scroll-snap paged navigation
// can swap the centered window without reconstructing derived info.
interface MaximizedWindowState {
  byWorkspace: Record<string, string | null>
  set: (workspaceId: string, windowId: string | null) => void
  get: (workspaceId: string) => string | null
  clear: (workspaceId: string) => void
}

export const useMaximizedWindow = create<MaximizedWindowState>((set, get) => ({
  byWorkspace: {},
  set: (workspaceId, windowId) =>
    set((s) => {
      if (s.byWorkspace[workspaceId] === windowId) return s
      return { byWorkspace: { ...s.byWorkspace, [workspaceId]: windowId } }
    }),
  get: (workspaceId) => get().byWorkspace[workspaceId] ?? null,
  clear: (workspaceId) =>
    set((s) => {
      if (!(workspaceId in s.byWorkspace)) return s
      const { [workspaceId]: _, ...rest } = s.byWorkspace
      return { byWorkspace: rest }
    }),
}))
