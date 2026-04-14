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
  sessions: SessionSummaryDTO[]
  sessionsStatus: Status
  sessionsError: string | null

  worktrees: WorktreeDTO[]
  worktreesStatus: Status
  worktreesError: string | null

  diffsByWorktree: Record<string, ChangedFileDTO[]>
  diffsStatus: Record<string, Status>

  refreshSessions: (workspaceId: string) => Promise<void>
  refreshWorktrees: (workspaceId: string) => Promise<void>
  refreshDiffsFor: (worktreePath: string) => Promise<void>
  clear: () => void
}

export const useSidebarData = create<State>((set) => ({
  sessions: [],
  sessionsStatus: 'idle',
  sessionsError: null,
  worktrees: [],
  worktreesStatus: 'idle',
  worktreesError: null,
  diffsByWorktree: {},
  diffsStatus: {},

  async refreshSessions(workspaceId) {
    set({ sessionsStatus: 'loading', sessionsError: null })
    try {
      const { sessions } = await invoke('sessions:list', { workspaceId })
      set({ sessions, sessionsStatus: 'ready' })
    } catch (err) {
      set({
        sessions: [],
        sessionsStatus: 'error',
        sessionsError: err instanceof Error ? err.message : String(err),
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
      sessions: [],
      sessionsStatus: 'idle',
      sessionsError: null,
      worktrees: [],
      worktreesStatus: 'idle',
      worktreesError: null,
      diffsByWorktree: {},
      diffsStatus: {},
    })
  },
}))
