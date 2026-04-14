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

type State = {
  sessions: SessionRecord[]
  activePtyId: string | null
  spawn: (workspaceId: string, cols: number, rows: number) => Promise<string>
  markExited: (ptyId: string, exitCode: number | null) => void
  setActive: (ptyId: string | null) => void
}

export const useSessions = create<State>((set) => ({
  sessions: [],
  activePtyId: null,
  async spawn(workspaceId, cols, rows) {
    const { ptyId, tmuxWindow } = await invoke('session:spawnClaude', { workspaceId, cols, rows })
    set((s) => ({
      sessions: [
        ...s.sessions,
        { ptyId, tmuxWindow, workspaceId, createdAt: Date.now(), exited: false, exitCode: null },
      ],
      activePtyId: ptyId,
    }))
    return ptyId
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
