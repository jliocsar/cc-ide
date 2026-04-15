import { create } from 'zustand'
import type {
  SessionSummaryDTO,
  WorktreeDTO,
  ChangedFileDTO,
} from '@shared/ipc'
import { invoke } from '@/lib/ipc'

export const EMPTY_FILES: readonly ChangedFileDTO[] = Object.freeze([])

type Status = 'idle' | 'loading' | 'ready' | 'error'

type State = {
  conversations: SessionSummaryDTO[]
  conversationsStatus: Status
  conversationsError: string | null

  worktrees: WorktreeDTO[]
  worktreesStatus: Status
  worktreesError: string | null

  diffsByWorktree: Record<string, ChangedFileDTO[]>
  diffsStatus: Record<string, Status>

  refreshConversations: (workspaceId: string) => Promise<void>
  refreshWorktrees: (workspaceId: string) => Promise<void>
  refreshDiffsFor: (worktreePath: string) => Promise<void>
  clear: () => void
}

export const useSidebarData = create<State>((set) => ({
  conversations: [],
  conversationsStatus: 'idle',
  conversationsError: null,
  worktrees: [],
  worktreesStatus: 'idle',
  worktreesError: null,
  diffsByWorktree: {},
  diffsStatus: {},

  async refreshConversations(workspaceId) {
    set({ conversationsStatus: 'loading', conversationsError: null })
    try {
      const { conversations } = await invoke('conversations:list', { workspaceId })
      set({ conversations, conversationsStatus: 'ready' })
    } catch (err) {
      set({
        conversations: [],
        conversationsStatus: 'error',
        conversationsError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  async refreshWorktrees(workspaceId) {
    set({ worktreesStatus: 'loading', worktreesError: null })
    try {
      const { worktrees } = await invoke('worktrees:list', { workspaceId })
      set({ worktrees, worktreesStatus: 'ready' })
    } catch (err) {
      set({
        worktrees: [],
        worktreesStatus: 'error',
        worktreesError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  async refreshDiffsFor(worktreePath) {
    set((s) => ({ diffsStatus: { ...s.diffsStatus, [worktreePath]: 'loading' } }))
    try {
      const { files } = await invoke('diffs:list', { worktreePath })
      set((s) => ({
        diffsByWorktree: { ...s.diffsByWorktree, [worktreePath]: files },
        diffsStatus: { ...s.diffsStatus, [worktreePath]: 'ready' },
      }))
    } catch {
      set((s) => ({
        diffsStatus: { ...s.diffsStatus, [worktreePath]: 'error' },
      }))
    }
  },

  clear() {
    set({
      conversations: [],
      conversationsStatus: 'idle',
      conversationsError: null,
      worktrees: [],
      worktreesStatus: 'idle',
      worktreesError: null,
      diffsByWorktree: {},
      diffsStatus: {},
    })
  },
}))
