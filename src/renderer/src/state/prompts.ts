import type { PromptDTO } from '@shared/ipc'
import { create } from 'zustand'
import { invoke } from '@/lib/ipc'

export type SortMode = 'favorites-first' | 'title'

type State = {
  prompts: PromptDTO[]
  query: string
  sort: SortMode
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  setQuery: (q: string) => void
  setSort: (s: SortMode) => void
  create: (input: { title: string; body: string; favorite?: boolean }) => Promise<PromptDTO>
  update: (
    id: string,
    patch: Partial<Pick<PromptDTO, 'title' | 'body' | 'favorite'>>,
  ) => Promise<PromptDTO>
  remove: (id: string) => Promise<void>
}

export const usePrompts = create<State>((set, get) => ({
  prompts: [],
  query: '',
  sort: 'favorites-first',
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null })
    try {
      const { prompts } = await invoke('globalPrompts:list', {
        query: get().query,
        sort: get().sort,
      })
      set({ prompts, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  setQuery(q) {
    set({ query: q })
    void get().refresh()
  },

  setSort(s) {
    set({ sort: s })
    void get().refresh()
  },

  async create(input) {
    const { prompt } = await invoke('globalPrompts:create', input)
    await get().refresh()
    return prompt
  },

  async update(id, patch) {
    const { prompt } = await invoke('globalPrompts:update', { id, patch })
    await get().refresh()
    return prompt
  },

  async remove(id) {
    await invoke('globalPrompts:delete', { id })
    await get().refresh()
  },
}))
