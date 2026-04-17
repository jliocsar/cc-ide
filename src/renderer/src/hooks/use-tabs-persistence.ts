import { useEffect, useRef } from 'react'
import { invoke } from '@/lib/ipc'
import { type TabsSnapshot, useTabs } from '@/state/tabs'
import { useWorkspaces } from '@/state/workspaces'

const SAVE_DEBOUNCE_MS = 500

export function useTabsPersistence(): void {
  const activeId = useWorkspaces((s) => s.activeId)
  const lastBoundRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeId) {
      useTabs.getState().switchWorkspace(null)
      return
    }

    let suspendSave = true
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const unsub = useTabs.subscribe(() => {
      if (suspendSave) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const snap = useTabs.getState().snapshotWorkspace(activeId)
        void invoke('tabs:save', { workspaceId: activeId, state: snap })
      }, SAVE_DEBOUNCE_MS)
    })

    void (async () => {
      const prev = lastBoundRef.current
      if (prev && prev !== activeId) {
        const prevSnap = useTabs.getState().snapshotWorkspace(prev)
        await invoke('tabs:save', { workspaceId: prev, state: prevSnap }).catch(() => {})
      }
      const { state } = await invoke('tabs:load', { workspaceId: activeId })
      useTabs.getState().hydrateWorkspace(activeId, (state as TabsSnapshot | null) ?? null)
      useTabs.getState().switchWorkspace(activeId)
      lastBoundRef.current = activeId

      suspendSave = false
    })()

    return () => {
      unsub()
      if (saveTimer) clearTimeout(saveTimer)
      const snap = useTabs.getState().snapshotWorkspace(activeId)
      void invoke('tabs:save', { workspaceId: activeId, state: snap }).catch(() => {})
    }
  }, [activeId])
}
