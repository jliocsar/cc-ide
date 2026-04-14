import { create } from 'zustand'

type State = {
  sidebarVisible: boolean
  toggleSidebar: () => void
  setSidebarVisible: (v: boolean) => void
}

export const useUi = create<State>((set) => ({
  sidebarVisible: true,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
}))
