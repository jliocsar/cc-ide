import { create } from 'zustand'

export const SIDEBAR_WIDTH_DEFAULT = 260
export const SIDEBAR_WIDTH_MIN = 220
export const SIDEBAR_WIDTH_MAX = 320

export const REVIEW_PANEL_WIDTH_DEFAULT = 360
export const REVIEW_PANEL_WIDTH_MIN = 300
export const REVIEW_PANEL_WIDTH_MAX = 440

const SIDEBAR_PERSIST_KEY = 'cc-ide:sidebar-ui'

type Persisted = {
  openSections: string[]
  sidebarScrollTop: number
}

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(SIDEBAR_PERSIST_KEY)
    if (!raw) return { openSections: [], sidebarScrollTop: 0 }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      openSections: Array.isArray(parsed.openSections)
        ? parsed.openSections.filter((v) => typeof v === 'string')
        : [],
      sidebarScrollTop:
        typeof parsed.sidebarScrollTop === 'number' && Number.isFinite(parsed.sidebarScrollTop)
          ? parsed.sidebarScrollTop
          : 0,
    }
  } catch {
    return { openSections: [], sidebarScrollTop: 0 }
  }
}

function writePersisted(p: Persisted): void {
  try {
    localStorage.setItem(SIDEBAR_PERSIST_KEY, JSON.stringify(p))
  } catch {
    // non-fatal
  }
}

type State = {
  sidebarVisible: boolean
  sidebarWidth: number
  reviewPanelWidth: number
  openSections: string[]
  sidebarScrollTop: number
  toggleSidebar: () => void
  setSidebarVisible: (v: boolean) => void
  setSidebarWidth: (w: number) => void
  resetSidebarWidth: () => void
  setReviewPanelWidth: (w: number) => void
  resetReviewPanelWidth: () => void
  setOpenSections: (sections: string[]) => void
  setSidebarScrollTop: (top: number) => void
}

function clamp(w: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, w))
}

const initialPersisted = typeof window !== 'undefined' ? readPersisted() : { openSections: [], sidebarScrollTop: 0 }

export const useUi = create<State>((set) => ({
  sidebarVisible: true,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  reviewPanelWidth: REVIEW_PANEL_WIDTH_DEFAULT,
  openSections: initialPersisted.openSections,
  sidebarScrollTop: initialPersisted.sidebarScrollTop,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX) }),
  resetSidebarWidth: () => set({ sidebarWidth: SIDEBAR_WIDTH_DEFAULT }),
  setReviewPanelWidth: (w) =>
    set({ reviewPanelWidth: clamp(w, REVIEW_PANEL_WIDTH_MIN, REVIEW_PANEL_WIDTH_MAX) }),
  resetReviewPanelWidth: () => set({ reviewPanelWidth: REVIEW_PANEL_WIDTH_DEFAULT }),
  setOpenSections: (sections) => set({ openSections: sections }),
  setSidebarScrollTop: (top) => set({ sidebarScrollTop: top }),
}))

if (typeof window !== 'undefined') {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  useUi.subscribe((state, prev) => {
    if (
      state.openSections === prev.openSections &&
      state.sidebarScrollTop === prev.sidebarScrollTop
    ) {
      return
    }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      writePersisted({
        openSections: state.openSections,
        sidebarScrollTop: state.sidebarScrollTop,
      })
    }, 250)
  })
}
