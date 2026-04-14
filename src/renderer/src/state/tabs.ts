import { create } from 'zustand'

export type TabKind = 'board' | 'plan' | 'diff' | 'prompt'

export type Tab =
  | { id: 'board'; kind: 'board'; title: string; pinned: true }
  | {
      id: string
      kind: 'plan'
      title: string
      pinned: false
      meta: { workspaceId: string; relPath: string }
    }
  | {
      id: string
      kind: 'diff'
      title: string
      pinned: false
      meta: { workspaceId: string; worktreePath: string; path: string; stage: 'staged' | 'unstaged' }
    }
  | {
      id: string
      kind: 'prompt'
      title: string
      pinned: false
      meta: { promptId: string }
    }

const BOARD: Tab = { id: 'board', kind: 'board', title: 'Board', pinned: true }

type State = {
  tabs: Tab[]
  activeId: string

  openPlan: (workspaceId: string, relPath: string) => void
  openDiff: (
    workspaceId: string,
    worktreePath: string,
    path: string,
    stage: 'staged' | 'unstaged',
  ) => void
  openPrompt: (promptId: string, title: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
}

function planTabId(workspaceId: string, relPath: string): string {
  return `plan:${workspaceId}:${relPath}`
}

function diffTabId(worktreePath: string, path: string, stage: string): string {
  return `diff:${worktreePath}:${stage}:${path}`
}

function promptTabId(promptId: string): string {
  return `prompt:${promptId}`
}

export const useTabs = create<State>((set, get) => ({
  tabs: [BOARD],
  activeId: BOARD.id,

  openPlan(workspaceId, relPath) {
    const id = planTabId(workspaceId, relPath)
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeId: id })
      return
    }
    const title = relPath.split('/').pop() || relPath
    const tab: Tab = {
      id,
      kind: 'plan',
      title,
      pinned: false,
      meta: { workspaceId, relPath },
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id }))
  },

  openDiff(workspaceId, worktreePath, path, stage) {
    const id = diffTabId(worktreePath, path, stage)
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeId: id })
      return
    }
    const title = path.split('/').pop() || path
    const tab: Tab = {
      id,
      kind: 'diff',
      title,
      pinned: false,
      meta: { workspaceId, worktreePath, path, stage },
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id }))
  },

  openPrompt(promptId, title) {
    const id = promptTabId(promptId)
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeId: id })
      return
    }
    const tab: Tab = { id, kind: 'prompt', title, pinned: false, meta: { promptId } }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id }))
  },

  closeTab(id) {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (!tab || tab.pinned) return s
      const remaining = s.tabs.filter((t) => t.id !== id)
      const nextActive =
        s.activeId === id
          ? remaining[remaining.length - 1]?.id ?? BOARD.id
          : s.activeId
      return { tabs: remaining, activeId: nextActive }
    })
  },

  setActive(id) {
    set((s) => (s.tabs.some((t) => t.id === id) ? { activeId: id } : s))
  },
}))
