import { useEffect, useRef } from 'react'
import { invoke } from '@/lib/ipc'
import { type PersistedCanvas, useCanvas } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'

const SAVE_DEBOUNCE_MS = 500

export function useCanvasPersistence(): void {
  const activeId = useWorkspaces((s) => s.activeId)
  const lastBoundRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeId) return

    let suspendSave = true
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const unsub = useCanvas.subscribe(() => {
      if (suspendSave) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const snap = useCanvas.getState().snapshot()
        void invoke('canvas:save', { workspaceId: activeId, state: snap })
      }, SAVE_DEBOUNCE_MS)
    })

    void (async () => {
      const prev = lastBoundRef.current
      if (prev && prev !== activeId) {
        const snap = useCanvas.getState().snapshot()
        await invoke('canvas:save', { workspaceId: prev, state: snap }).catch(() => {})
      }
      const { state } = await invoke('canvas:load', { workspaceId: activeId })
      useCanvas.getState().hydrate((state as PersistedCanvas | null) ?? null)
      lastBoundRef.current = activeId

      relinkExistingSessions(activeId)
      await rehydrateLiveSessions(activeId)

      suspendSave = false
    })()

    return () => {
      unsub()
      if (saveTimer) clearTimeout(saveTimer)
      const snap = useCanvas.getState().snapshot()
      void invoke('canvas:save', { workspaceId: activeId, state: snap }).catch(() => {})
    }
  }, [activeId])
}

// Canvas snapshot strips sessionId, so on workspace re-entry every window
// arrives back as `sessionId: null` (dormant). If the matching SessionRecord
// is still alive in `useSessions`, reuse its ptyId — otherwise rehydrate
// would spawn a NEW viewer pty for the same tmux window and registerExisting
// would push a second SessionRecord, duplicating the row in the sidebar.
function relinkExistingSessions(workspaceId: string): void {
  const { sessions } = useSessions.getState()
  const byTmuxWindow = new Map<string, string>()
  for (const s of sessions) {
    if (s.workspaceId !== workspaceId || s.exited) continue
    byTmuxWindow.set(s.tmuxWindow, s.ptyId)
  }
  if (byTmuxWindow.size === 0) return
  const { windows, updateWindow } = useCanvas.getState()
  for (const w of windows) {
    if (w.sessionId !== null) continue
    const ptyId = byTmuxWindow.get(w.tmuxWindow)
    if (ptyId) updateWindow(w.id, { sessionId: ptyId })
  }
}

async function rehydrateLiveSessions(workspaceId: string): Promise<void> {
  const { windows } = useCanvas.getState()
  const dormant = windows.filter((w) => w.sessionId === null)
  if (dormant.length === 0) return

  await Promise.all(
    dormant.map(async (w) => {
      try {
        const { ptyId, exists } = await invoke('session:attachExisting', {
          workspaceId,
          tmuxWindow: w.tmuxWindow,
          cols: 120,
          rows: 30,
        })
        if (!exists || !ptyId) return
        useSessions.getState().registerExisting({ ptyId, tmuxWindow: w.tmuxWindow, workspaceId })
        useCanvas.getState().updateWindow(w.id, { sessionId: ptyId })
      } catch (err) {
        console.error('[rehydrate]', w.tmuxWindow, err)
      }
    }),
  )
}
