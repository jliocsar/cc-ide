import { useEffect, useRef } from 'react'
import { useDrops } from '@/state/drops'
import { useWorkspaces } from '@/state/workspaces'
import { invoke } from '@/lib/ipc'

const SAVE_DEBOUNCE_MS = 500

/**
 * Hydrate + persist drops per workspace. Mirrors use-canvas-persistence.
 */
export function useDropsPersistence(): void {
  const activeId = useWorkspaces((s) => s.activeId)
  const lastBoundRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeId) return

    let suspendSave = true
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const unsub = useDrops.subscribe(() => {
      if (suspendSave) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const entries = useDrops.getState().byWorkspace[activeId] ?? []
        void invoke('drops:write', { workspaceId: activeId, entries })
      }, SAVE_DEBOUNCE_MS)
    })

    void (async () => {
      const prev = lastBoundRef.current
      if (prev && prev !== activeId) {
        const prevEntries = useDrops.getState().byWorkspace[prev] ?? []
        await invoke('drops:write', {
          workspaceId: prev,
          entries: prevEntries,
        }).catch(() => {})
      }
      const { entries } = await invoke('drops:list', {
        workspaceId: activeId,
      })
      useDrops.getState().hydrate(activeId, entries)
      lastBoundRef.current = activeId
      suspendSave = false
    })()

    return () => {
      unsub()
      if (saveTimer) clearTimeout(saveTimer)
      const entries = useDrops.getState().byWorkspace[activeId] ?? []
      void invoke('drops:write', {
        workspaceId: activeId,
        entries,
      }).catch(() => {})
    }
  }, [activeId])
}
