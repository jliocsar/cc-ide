import { useEffect, useRef } from 'react'
import { useCanvas, type PersistedCanvas } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'
import { invoke } from '@/lib/ipc'

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
