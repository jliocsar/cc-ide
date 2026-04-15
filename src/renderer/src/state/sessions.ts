import { create } from 'zustand'
import { invoke } from '@/lib/ipc'

export type SessionRecord = {
  ptyId: string
  tmuxWindow: string
  workspaceId: string
  createdAt: number
  exited: boolean
  exitCode: number | null
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
  ) => Promise<{ ptyId: string; tmuxWindow: string }>
  resume: (workspaceId: string, sessionId: string, cols: number, rows: number) => Promise<{ ptyId: string; tmuxWindow: string }>
  registerExisting: (record: Omit<SessionRecord, 'createdAt' | 'exited' | 'exitCode'>) => void
  markExited: (ptyId: string, exitCode: number | null) => void
  setActive: (ptyId: string | null) => void
}

export const useSessions = create<State>((set) => ({
  sessions: [],
  activePtyId: null,
  async spawn(workspaceId, cols, rows, worktree) {
    const { ptyId, tmuxWindow } = await invoke('session:spawnClaude', {
      workspaceId,
      cols,
      rows,
      worktree,
    })
    set((s) => ({
      sessions: [
        ...s.sessions,
        { ptyId, tmuxWindow, workspaceId, createdAt: Date.now(), exited: false, exitCode: null },
      ],
      activePtyId: ptyId,
    }))
    return { ptyId, tmuxWindow }
  },
  async resume(workspaceId, sessionId, cols, rows) {
    const { ptyId, tmuxWindow } = await invoke('session:resumeClaude', { workspaceId, sessionId, cols, rows })
    set((s) => ({
      sessions: [
        ...s.sessions,
        { ptyId, tmuxWindow, workspaceId, createdAt: Date.now(), exited: false, exitCode: null },
      ],
      activePtyId: ptyId,
    }))
    return { ptyId, tmuxWindow }
  },
  registerExisting({ ptyId, tmuxWindow, workspaceId }) {
    set((s) => ({
      sessions: [
        ...s.sessions,
        { ptyId, tmuxWindow, workspaceId, createdAt: Date.now(), exited: false, exitCode: null },
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
}))
