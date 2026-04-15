import { create } from 'zustand'
import { invoke } from '@/lib/ipc'

export type PlanFile = {
  kind: 'file'
  name: string
  relPath: string
  size: number
  updatedAt: number
}

export type PlanDir = {
  kind: 'dir'
  name: string
  relPath: string
  children: PlanNode[]
}

export type PlanNode = PlanFile | PlanDir

type Status = 'idle' | 'loading' | 'ready' | 'error'

type State = {
  workspaceId: string | null
  root: PlanDir | null
  status: Status
  error: string | null
  expanded: Set<string>

  load: (workspaceId: string) => Promise<void>
  refresh: () => Promise<void>
  toggle: (relPath: string) => void
  setExpanded: (relPath: string, expanded: boolean) => void
  rewriteExpandedForMove: (fromRel: string, toRel: string) => void
}

export const usePlansTree = create<State>((set, get) => ({
  workspaceId: null,
  root: null,
  status: 'idle',
  error: null,
  expanded: new Set<string>(['']),

  async load(workspaceId) {
    set({ workspaceId, status: 'loading', error: null })
    try {
      const { tree } = await invoke('plans:tree', { workspaceId })
      set({ root: tree as PlanDir, status: 'ready' })
    } catch (err) {
      set({
        root: null,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  async refresh() {
    const id = get().workspaceId
    if (!id) return
    await get().load(id)
  },

  toggle(relPath) {
    set((s) => {
      const next = new Set(s.expanded)
      if (next.has(relPath)) next.delete(relPath)
      else next.add(relPath)
      return { expanded: next }
    })
  },

  setExpanded(relPath, expanded) {
    set((s) => {
      const next = new Set(s.expanded)
      if (expanded) next.add(relPath)
      else next.delete(relPath)
      return { expanded: next }
    })
  },

  rewriteExpandedForMove(fromRel, toRel) {
    set((s) => {
      const next = new Set<string>()
      for (const k of s.expanded) {
        if (k === fromRel) next.add(toRel)
        else if (k.startsWith(fromRel + '/')) next.add(toRel + k.slice(fromRel.length))
        else next.add(k)
      }
      return { expanded: next }
    })
  },
}))
