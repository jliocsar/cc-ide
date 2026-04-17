import { create } from 'zustand'

export type PlanMode = 'edit' | 'review'

type Entry = {
  mode: PlanMode
  sidebarCollapsed: boolean
  autoExpandedOnce: boolean
  dirty: boolean
}

const defaultEntry: Entry = {
  mode: 'review',
  sidebarCollapsed: false,
  autoExpandedOnce: false,
  dirty: false,
}

type State = {
  byTab: Record<string, Entry>
  pendingCloseId: string | null
  vimModeByTab: Record<string, string | null>
  entry: (tabId: string) => Entry
  setMode: (tabId: string, mode: PlanMode) => void
  toggleMode: (tabId: string) => void
  setSidebarCollapsed: (tabId: string, v: boolean) => void
  markAutoExpanded: (tabId: string) => void
  setDirty: (tabId: string, v: boolean) => void
  setPendingCloseId: (v: string | null) => void
  setVimMode: (tabId: string, mode: string | null) => void
  reset: (tabId: string) => void
}

export const usePlanTabUi = create<State>((set, get) => ({
  byTab: {},
  pendingCloseId: null,
  vimModeByTab: {},
  setPendingCloseId: (v) => set({ pendingCloseId: v }),
  setVimMode: (tabId, mode) => set((s) => ({ vimModeByTab: { ...s.vimModeByTab, [tabId]: mode } })),
  entry: (tabId) => get().byTab[tabId] ?? defaultEntry,
  setMode: (tabId, mode) =>
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...(s.byTab[tabId] ?? defaultEntry), mode },
      },
    })),
  toggleMode: (tabId) =>
    set((s) => {
      const curr = s.byTab[tabId] ?? defaultEntry
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { ...curr, mode: curr.mode === 'edit' ? 'review' : 'edit' },
        },
      }
    }),
  setSidebarCollapsed: (tabId, v) =>
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...(s.byTab[tabId] ?? defaultEntry), sidebarCollapsed: v },
      },
    })),
  markAutoExpanded: (tabId) =>
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...(s.byTab[tabId] ?? defaultEntry), autoExpandedOnce: true },
      },
    })),
  setDirty: (tabId, v) =>
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...(s.byTab[tabId] ?? defaultEntry), dirty: v },
      },
    })),
  reset: (tabId) =>
    set((s) => {
      const { [tabId]: _dropped, ...rest } = s.byTab
      return { byTab: rest }
    }),
}))
