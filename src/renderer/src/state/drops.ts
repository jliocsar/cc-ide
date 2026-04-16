import { create } from 'zustand'
import type { DropEntryDTO } from '@shared/ipc'

export type DropEntry = DropEntryDTO

const EMPTY_ENTRIES: ReadonlyArray<DropEntry> = Object.freeze([])

interface DropsState {
  byWorkspace: Record<string, DropEntry[]>

  hydrate: (workspaceId: string, entries: DropEntry[]) => void
  add: (entry: DropEntry) => void
  remove: (workspaceId: string, id: string) => void
  has: (workspaceId: string, relPath: string) => boolean
  clear: (workspaceId: string) => void
}

export const useDrops = create<DropsState>((set, get) => ({
  byWorkspace: {},

  hydrate: (workspaceId, entries) =>
    set((s) => ({
      byWorkspace: { ...s.byWorkspace, [workspaceId]: entries },
    })),

  add: (entry) =>
    set((s) => {
      const list = s.byWorkspace[entry.workspaceId] ?? []
      if (list.some((e) => e.relPath === entry.relPath)) return s
      return {
        byWorkspace: {
          ...s.byWorkspace,
          [entry.workspaceId]: [...list, entry],
        },
      }
    }),

  remove: (workspaceId, id) =>
    set((s) => {
      const list = s.byWorkspace[workspaceId]
      if (!list) return s
      const next = list.filter((e) => e.id !== id)
      if (next.length === list.length) return s
      return { byWorkspace: { ...s.byWorkspace, [workspaceId]: next } }
    }),

  has: (workspaceId, relPath) => {
    const list = get().byWorkspace[workspaceId]
    if (!list) return false
    return list.some((e) => e.relPath === relPath)
  },

  clear: (workspaceId) =>
    set((s) => {
      if (!s.byWorkspace[workspaceId]) return s
      const next = { ...s.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    }),
}))

export function selectDropsFor(
  workspaceId: string | null | undefined,
): (s: DropsState) => ReadonlyArray<DropEntry> {
  if (!workspaceId) return () => EMPTY_ENTRIES
  return (s) => s.byWorkspace[workspaceId] ?? EMPTY_ENTRIES
}
