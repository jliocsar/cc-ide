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

export type TabsSnapshot = { tabs: Tab[]; activeId: string }

function emptyEntry(): TabsSnapshot {
  return { tabs: [BOARD], activeId: BOARD.id }
}

type State = {
  tabs: Tab[]
  activeId: string

  _byWorkspace: Record<string, TabsSnapshot>
  _activeWorkspaceId: string | null

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
  reorderTab: (dragId: string, targetId: string) => void

  switchWorkspace: (id: string | null) => void
  hydrateWorkspace: (id: string, state: TabsSnapshot | null) => void
  snapshotWorkspace: (id: string) => TabsSnapshot
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

function normalize(raw: TabsSnapshot | null): TabsSnapshot {
  if (!raw || !Array.isArray(raw.tabs)) return emptyEntry()
  const filtered = raw.tabs.filter((t): t is Tab => {
    if (!t || typeof t !== 'object') return false
    return t.kind === 'board' || t.kind === 'plan' || t.kind === 'diff' || t.kind === 'prompt'
  })
  const hasBoard = filtered.some((t) => t.id === 'board')
  const tabs: Tab[] = hasBoard ? filtered : [BOARD, ...filtered]
  const activeId = tabs.some((t) => t.id === raw.activeId) ? raw.activeId : BOARD.id
  return { tabs, activeId }
}

export const useTabs = create<State>((set, get) => {
  function commit(updater: (curr: TabsSnapshot) => TabsSnapshot): void {
    const s = get()
    const id = s._activeWorkspaceId
    if (!id) return
    const curr = s._byWorkspace[id] ?? emptyEntry()
    const next = updater(curr)
    set({
      _byWorkspace: { ...s._byWorkspace, [id]: next },
      tabs: next.tabs,
      activeId: next.activeId,
    })
  }

  return {
    tabs: [BOARD],
    activeId: BOARD.id,
    _byWorkspace: {},
    _activeWorkspaceId: null,

    openPlan(workspaceId, relPath) {
      const id = planTabId(workspaceId, relPath)
      commit((curr) => {
        if (curr.tabs.some((t) => t.id === id)) return { ...curr, activeId: id }
        const title = relPath.split('/').pop() || relPath
        const tab: Tab = { id, kind: 'plan', title, pinned: false, meta: { workspaceId, relPath } }
        return { tabs: [...curr.tabs, tab], activeId: id }
      })
    },

    openDiff(workspaceId, worktreePath, path, stage) {
      const id = diffTabId(worktreePath, path, stage)
      commit((curr) => {
        if (curr.tabs.some((t) => t.id === id)) return { ...curr, activeId: id }
        const title = path.split('/').pop() || path
        const tab: Tab = {
          id,
          kind: 'diff',
          title,
          pinned: false,
          meta: { workspaceId, worktreePath, path, stage },
        }
        return { tabs: [...curr.tabs, tab], activeId: id }
      })
    },

    openPrompt(promptId, title) {
      const id = promptTabId(promptId)
      commit((curr) => {
        if (curr.tabs.some((t) => t.id === id)) return { ...curr, activeId: id }
        const tab: Tab = { id, kind: 'prompt', title, pinned: false, meta: { promptId } }
        return { tabs: [...curr.tabs, tab], activeId: id }
      })
    },

    closeTab(id) {
      commit((curr) => {
        const tab = curr.tabs.find((t) => t.id === id)
        if (!tab || tab.pinned) return curr
        const remaining = curr.tabs.filter((t) => t.id !== id)
        const nextActive =
          curr.activeId === id
            ? remaining[remaining.length - 1]?.id ?? BOARD.id
            : curr.activeId
        return { tabs: remaining, activeId: nextActive }
      })
    },

    setActive(id) {
      commit((curr) => (curr.tabs.some((t) => t.id === id) ? { ...curr, activeId: id } : curr))
    },

    reorderTab(dragId, targetId) {
      commit((curr) => {
        if (dragId === targetId) return curr
        const drag = curr.tabs.find((t) => t.id === dragId)
        const target = curr.tabs.find((t) => t.id === targetId)
        if (!drag || !target) return curr
        if (drag.pinned) return curr
        if (target.pinned && curr.tabs.indexOf(target) === 0) return curr
        const without = curr.tabs.filter((t) => t.id !== dragId)
        const targetIdx = without.findIndex((t) => t.id === targetId)
        if (targetIdx < 0) return curr
        const next = [...without.slice(0, targetIdx), drag, ...without.slice(targetIdx)]
        return { ...curr, tabs: next }
      })
    },

    switchWorkspace(id) {
      if (id === null) {
        set({ _activeWorkspaceId: null, tabs: [BOARD], activeId: BOARD.id })
        return
      }
      const curr = get()._byWorkspace[id] ?? emptyEntry()
      set({ _activeWorkspaceId: id, tabs: curr.tabs, activeId: curr.activeId })
    },

    hydrateWorkspace(id, state) {
      const entry = normalize(state)
      const s = get()
      const isActive = s._activeWorkspaceId === id
      set({
        _byWorkspace: { ...s._byWorkspace, [id]: entry },
        ...(isActive ? { tabs: entry.tabs, activeId: entry.activeId } : {}),
      })
    },

    snapshotWorkspace(id) {
      return get()._byWorkspace[id] ?? emptyEntry()
    },
  }
})
