import type { TranscriptEntry } from '@shared/ipc'
import { create } from 'zustand'

// Per-subagent-window transcript entries. Not persisted; reset on workspace
// switch by whatever drives the canvas hydrate (agent events rebuild these).

export const EMPTY_TRANSCRIPT: readonly TranscriptEntry[] = Object.freeze([] as TranscriptEntry[])

type State = {
  byWindow: Record<string, TranscriptEntry[]>
  append: (windowId: string, entries: TranscriptEntry[]) => void
  reset: (windowId: string) => void
  clearAll: () => void
  entries: (windowId: string) => readonly TranscriptEntry[]
}

export const useSubagentTranscripts = create<State>((set, get) => ({
  byWindow: {},

  append: (windowId, entries) =>
    set((s) => {
      if (entries.length === 0) return s
      const prior = s.byWindow[windowId] ?? []
      // Dedupe by uuid in case a poll + watch cycle both surface the same entry.
      const seen = new Set(prior.map((e) => e.uuid))
      const fresh = entries.filter((e) => !seen.has(e.uuid))
      if (fresh.length === 0) return s
      return {
        byWindow: { ...s.byWindow, [windowId]: [...prior, ...fresh] },
      }
    }),

  reset: (windowId) =>
    set((s) => {
      if (!(windowId in s.byWindow)) return s
      const { [windowId]: _dropped, ...rest } = s.byWindow
      return { byWindow: rest }
    }),

  clearAll: () => set({ byWindow: {} }),

  entries: (windowId) => get().byWindow[windowId] ?? EMPTY_TRANSCRIPT,
}))
