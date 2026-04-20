import { create } from 'zustand'

export const SIDEBAR_WIDTH_DEFAULT = 260
export const SIDEBAR_WIDTH_MIN = 220
export const SIDEBAR_WIDTH_MAX = 320

export const REVIEW_PANEL_WIDTH_DEFAULT = 360
export const REVIEW_PANEL_WIDTH_MIN = 300
export const REVIEW_PANEL_WIDTH_MAX = 440

type State = {
  sidebarVisible: boolean
  sidebarWidth: number
  reviewPanelWidth: number
  toggleSidebar: () => void
  setSidebarVisible: (v: boolean) => void
  setSidebarWidth: (w: number) => void
  resetSidebarWidth: () => void
  setReviewPanelWidth: (w: number) => void
  resetReviewPanelWidth: () => void
}

function clamp(w: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, w))
}

export const useUi = create<State>((set) => ({
  sidebarVisible: true,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  reviewPanelWidth: REVIEW_PANEL_WIDTH_DEFAULT,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX) }),
  resetSidebarWidth: () => set({ sidebarWidth: SIDEBAR_WIDTH_DEFAULT }),
  setReviewPanelWidth: (w) =>
    set({ reviewPanelWidth: clamp(w, REVIEW_PANEL_WIDTH_MIN, REVIEW_PANEL_WIDTH_MAX) }),
  resetReviewPanelWidth: () => set({ reviewPanelWidth: REVIEW_PANEL_WIDTH_DEFAULT }),
}))
