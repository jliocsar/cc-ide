import { create } from 'zustand'
import type { NodeId } from './depgraph'

/**
 * In-memory-only position cache per workspace. Survives graph-mode toggle; dies
 * on workspace-switch + app-quit. See plan Q9.
 */
interface PositionsState {
  byWorkspace: Record<string, Map<NodeId, { x: number; y: number }>>

  setPositions: (
    workspaceId: string,
    entries: Iterable<readonly [NodeId, { x: number; y: number }]>,
  ) => void
  clear: (workspaceId: string) => void
  get: (workspaceId: string) => Map<NodeId, { x: number; y: number }> | null
}

export const useGraphPositions = create<PositionsState>((set, get) => ({
  byWorkspace: {},

  setPositions: (workspaceId, entries) =>
    set((s) => {
      const map = new Map<NodeId, { x: number; y: number }>()
      for (const [k, v] of entries) map.set(k, { x: v.x, y: v.y })
      return { byWorkspace: { ...s.byWorkspace, [workspaceId]: map } }
    }),

  clear: (workspaceId) =>
    set((s) => {
      if (!s.byWorkspace[workspaceId]) return s
      const next = { ...s.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    }),

  get: (workspaceId) => get().byWorkspace[workspaceId] ?? null,
}))
