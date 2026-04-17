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
      meta: {
        workspaceId: string
        worktreePath: string
        path: string
        stage: 'staged' | 'unstaged'
      }
    }
  | {
      id: string
      kind: 'prompt'
      title: string
      pinned: false
      meta: { workspaceId: string; relPath: string }
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
  openPrompt: (workspaceId: string, relPath: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  reorderTab: (dragId: string, targetId: string) => void

  switchWorkspace: (id: string | null) => void
  hydrateWorkspace: (id: string, state: TabsSnapshot | null) => void
  snapshotWorkspace: (id: string) => TabsSnapshot
  rewritePlanTabsForMove: (workspaceId: string, fromRel: string, toRel: string) => void
  rewritePromptTabsForMove: (workspaceId: string, fromRel: string, toRel: string) => void
}

function planTabId(workspaceId: string, relPath: string): string {
  return `plan:${workspaceId}:${relPath}`
}

function diffTabId(worktreePath: string, path: string, stage: string): string {
  return `diff:${worktreePath}:${stage}:${path}`
}

function promptTabId(workspaceId: string, relPath: string): string {
  return `prompt:${workspaceId}:${relPath}`
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

    openPrompt(workspaceId, relPath) {
      const id = promptTabId(workspaceId, relPath)
      commit((curr) => {
        if (curr.tabs.some((t) => t.id === id)) return { ...curr, activeId: id }
        const title = relPath.split('/').pop() || relPath
        const tab: Tab = {
          id,
          kind: 'prompt',
          title,
          pinned: false,
          meta: { workspaceId, relPath },
        }
        return { tabs: [...curr.tabs, tab], activeId: id }
      })
    },

    closeTab(id) {
      commit((curr) => {
        const tab = curr.tabs.find((t) => t.id === id)
        if (!tab || tab.pinned) return curr
        const remaining = curr.tabs.filter((t) => t.id !== id)
        const nextActive =
          curr.activeId === id ? (remaining[remaining.length - 1]?.id ?? BOARD.id) : curr.activeId
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

    rewritePlanTabsForMove(workspaceId, fromRel, toRel) {
      remapKind('plan', workspaceId, fromRel, toRel, planTabId, get, set)
    },

    rewritePromptTabsForMove(workspaceId, fromRel, toRel) {
      remapKind('prompt', workspaceId, fromRel, toRel, promptTabId, get, set)
    },
  }
})

function remapKind(
  kind: 'plan' | 'prompt',
  workspaceId: string,
  fromRel: string,
  toRel: string,
  mkId: (workspaceId: string, relPath: string) => string,
  get: () => State,
  set: (partial: Partial<State>) => void,
): void {
  function remap(tab: Tab): Tab {
    if (tab.kind !== kind) return tab
    if (tab.meta.workspaceId !== workspaceId) return tab
    const rel = tab.meta.relPath
    let next: string | null = null
    if (rel === fromRel) next = toRel
    else if (rel.startsWith(fromRel + '/')) next = toRel + rel.slice(fromRel.length)
    if (next === null) return tab
    return {
      ...tab,
      id: mkId(workspaceId, next),
      title: next.split('/').pop() || next,
      meta: { ...tab.meta, relPath: next },
    } as Tab
  }
  function remapSnapshot(snap: TabsSnapshot): TabsSnapshot {
    const tabs = snap.tabs.map(remap)
    const oldToNew = new Map<string, string>()
    snap.tabs.forEach((t, i) => {
      const r = tabs[i]
      if (r && t.id !== r.id) oldToNew.set(t.id, r.id)
    })
    const activeId = oldToNew.get(snap.activeId) ?? snap.activeId
    return { tabs, activeId }
  }
  const s = get()
  const byWs = { ...s._byWorkspace }
  if (byWs[workspaceId]) byWs[workspaceId] = remapSnapshot(byWs[workspaceId])
  const isActive = s._activeWorkspaceId === workspaceId
  const liveSnap: TabsSnapshot = isActive
    ? (byWs[workspaceId] ?? { tabs: s.tabs, activeId: s.activeId })
    : { tabs: s.tabs, activeId: s.activeId }
  set({
    _byWorkspace: byWs,
    ...(isActive ? { tabs: liveSnap.tabs, activeId: liveSnap.activeId } : {}),
  })
}
