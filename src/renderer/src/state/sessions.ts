import { create } from 'zustand'
import { invoke } from '@/lib/ipc'
import { useCanvas } from '@/state/canvas'

export type SessionRecord = {
  ptyId: string
  tmuxWindow: string
  workspaceId: string
  createdAt: number
  exited: boolean
  exitCode: number | null
  worktreeBranch: string | null
}

export type SpawnWorktreeOption =
  | { kind: 'primary' }
  | { kind: 'existing'; path: string }
  | { kind: 'new'; branch: string; base: string }

type State = {
  sessions: SessionRecord[]
  activePtyId: string | null
  spawn: (
    workspaceId: string,
    cols: number,
    rows: number,
    worktree?: SpawnWorktreeOption,
    customName?: string,
  ) => Promise<{ ptyId: string; tmuxWindow: string }>
  resume: (
    workspaceId: string,
    sessionId: string,
    cols: number,
    rows: number,
  ) => Promise<{ ptyId: string; tmuxWindow: string }>
  registerExisting: (record: Omit<SessionRecord, 'createdAt' | 'exited' | 'exitCode'>) => void
  markExited: (ptyId: string, exitCode: number | null) => void
  setActive: (ptyId: string | null) => void
  rename: (oldTmuxWindow: string, newName: string) => Promise<string>
}

export const useSessions = create<State>((set) => ({
  sessions: [],
  activePtyId: null,
  async spawn(workspaceId, cols, rows, worktree, customName) {
    const { ptyId, tmuxWindow, worktreeBranch } = await invoke('session:spawnClaude', {
      workspaceId,
      cols,
      rows,
      worktree,
      customName,
    })
    set((s) => ({
      sessions: [
        ...s.sessions,
        {
          ptyId,
          tmuxWindow,
          workspaceId,
          createdAt: Date.now(),
          exited: false,
          exitCode: null,
          worktreeBranch,
        },
      ],
      activePtyId: ptyId,
    }))
    return { ptyId, tmuxWindow }
  },
  async resume(workspaceId, sessionId, cols, rows) {
    const { ptyId, tmuxWindow, worktreeBranch } = await invoke('session:resumeClaude', {
      workspaceId,
      sessionId,
      cols,
      rows,
    })
    set((s) => ({
      sessions: [
        ...s.sessions,
        {
          ptyId,
          tmuxWindow,
          workspaceId,
          createdAt: Date.now(),
          exited: false,
          exitCode: null,
          worktreeBranch,
        },
      ],
      activePtyId: ptyId,
    }))
    return { ptyId, tmuxWindow }
  },
  registerExisting({ ptyId, tmuxWindow, workspaceId }) {
    set((s) => ({
      sessions: [
        ...s.sessions,
        {
          ptyId,
          tmuxWindow,
          workspaceId,
          createdAt: Date.now(),
          exited: false,
          exitCode: null,
          worktreeBranch: null,
        },
      ],
    }))
  },
  markExited(ptyId, exitCode) {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.ptyId === ptyId ? { ...sess, exited: true, exitCode } : sess,
      ),
    }))
  },
  setActive(ptyId) {
    set({ activePtyId: ptyId })
  },
  async rename(oldTmuxWindow, newName) {
    const { tmuxWindow: newTmuxWindow } = await invoke('session:renameTmuxWindow', {
      tmuxWindow: oldTmuxWindow,
      newName,
    })
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.tmuxWindow === oldTmuxWindow ? { ...sess, tmuxWindow: newTmuxWindow } : sess,
      ),
    }))
    useCanvas.getState().renameByTmuxWindow(oldTmuxWindow, newTmuxWindow)
    return newTmuxWindow
  },
}))
