import { create } from 'zustand'
import type { SpawnWorktreeOption } from './sessions'

type ViewportPos = { x: number; y: number }

type State = {
  isOpen: boolean
  viewportPos: ViewportPos | null
  open: (pos?: ViewportPos) => void
  close: () => void
}

export const useSpawnModal = create<State>((set) => ({
  isOpen: false,
  viewportPos: null,
  open(pos) {
    set({ isOpen: true, viewportPos: pos ?? null })
  },
  close() {
    set({ isOpen: false, viewportPos: null })
  },
}))

const LAST_USED_KEY = 'cc-ide:last-worktree-choice'

type LastUsed = Record<string, SpawnWorktreeOption>

function readLastUsed(): LastUsed {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LastUsed
    if (parsed && typeof parsed === 'object') return parsed
    return {}
  } catch {
    return {}
  }
}

export function getLastUsedWorktree(workspaceId: string): SpawnWorktreeOption | null {
  const all = readLastUsed()
  return all[workspaceId] ?? null
}

export function setLastUsedWorktree(workspaceId: string, option: SpawnWorktreeOption): void {
  // Don't persist "new" — it refers to a one-shot branch name.
  if (option.kind === 'new') return
  try {
    const all = readLastUsed()
    all[workspaceId] = option
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(all))
  } catch {
    // non-fatal
  }
}
