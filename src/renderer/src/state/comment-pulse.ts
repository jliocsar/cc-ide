import { create } from 'zustand'

type State = {
  byTab: Record<string, string | null>
  focusedByTab: Record<string, string | null>
  pulse: (tabId: string, rangeId: string) => void
  isPulsing: (tabId: string, rangeId: string) => boolean
  setFocused: (tabId: string, rangeId: string | null) => void
}

const PULSE_MS = 700

export const useCommentPulse = create<State>((set, get) => ({
  byTab: {},
  focusedByTab: {},
  pulse: (tabId, rangeId) => {
    set((s) => ({ byTab: { ...s.byTab, [tabId]: rangeId } }))
    window.setTimeout(() => {
      set((s) => ({
        byTab: {
          ...s.byTab,
          [tabId]: s.byTab[tabId] === rangeId ? null : (s.byTab[tabId] ?? null),
        },
      }))
    }, PULSE_MS)
  },
  isPulsing: (tabId, rangeId) => get().byTab[tabId] === rangeId,
  setFocused: (tabId, rangeId) =>
    set((s) => ({ focusedByTab: { ...s.focusedByTab, [tabId]: rangeId } })),
}))
