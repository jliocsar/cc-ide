import { create } from 'zustand'
import type { Workspace } from '@shared/ipc'
import { invoke } from '@/lib/ipc'

type State = {
  workspaces: Workspace[]
  activeId: string | null
  loaded: boolean
  refresh: () => Promise<void>
  pickAndAdd: () => Promise<string | null>
  setActive: (id: string) => void
  remove: (id: string) => Promise<void>
}

export const useWorkspaces = create<State>((set, get) => ({
  workspaces: [],
  activeId: null,
  loaded: false,
  async refresh() {
    const { workspaces } = await invoke('workspace:list', {})
    set((s) => ({
      workspaces,
      loaded: true,
      activeId: s.activeId ?? workspaces[0]?.id ?? null,
    }))
  },
  async pickAndAdd() {
    const { workspace, error } = await invoke('workspace:pickAndAdd', {})
    if (error) {
      console.error('[workspace:pickAndAdd]', error)
      return null
    }
    if (!workspace) return null
    await get().refresh()
    set({ activeId: workspace.id })
    return workspace.id
  },
  setActive(id) {
    set({ activeId: id })
  },
  async remove(id) {
    await invoke('workspace:remove', { id })
    await get().refresh()
    set((s) => ({
      activeId:
        s.activeId === id ? (s.workspaces.find((w) => w.id !== id)?.id ?? null) : s.activeId,
    }))
  },
}))
