import { create } from 'zustand'

interface MaximizedWindowInfo {
  windowId: string
  title: string
  badge: 'live' | 'exited' | 'dormant'
  exitCode?: number | null
  onClose: () => void
}

interface MaximizedWindowState {
  byWorkspace: Record<string, MaximizedWindowInfo | null>
  set: (workspaceId: string, info: MaximizedWindowInfo | null) => void
  get: (workspaceId: string) => MaximizedWindowInfo | null
  clear: (workspaceId: string) => void
}

export const useMaximizedWindow = create<MaximizedWindowState>((set, get) => ({
  byWorkspace: {},
  set: (workspaceId, info) =>
    set((s) => ({
      byWorkspace: { ...s.byWorkspace, [workspaceId]: info },
    })),
  get: (workspaceId) => get().byWorkspace[workspaceId] ?? null,
  clear: (workspaceId) =>
    set((s) => {
      if (!(workspaceId in s.byWorkspace)) return s
      const { [workspaceId]: _, ...rest } = s.byWorkspace
      return { byWorkspace: rest }
    }),
}))
