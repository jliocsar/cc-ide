import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/components/palette/command-palette'
import { PromptsModal } from '@/components/palette/prompts-modal'
import { SettingsModal } from '@/components/settings/settings-modal'
import { PixelGridLoader } from '@/components/ui/pixel-grid-loader'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VerticalResizer } from '@/components/vertical-resizer'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { useDropsPersistence } from '@/hooks/use-drops-persistence'
import { useTabsPersistence } from '@/hooks/use-tabs-persistence'
import { invoke, onEvent } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useCanvas } from '@/state/canvas'
import { useMaximizedWindow } from '@/state/maximized-window'
import { usePalette } from '@/state/palette'
import { usePlanTabUi } from '@/state/plan-tab-ui'
import { useSessions } from '@/state/sessions'
import { useSidebarData } from '@/state/sidebar-data'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'
import { useWorkspaces } from '@/state/workspaces'
import { HeaderTabs } from './header-tabs'
import { Sidebar } from './sidebar'
import { SpawnModal } from './spawn-modal'
import { Statusbar } from './statusbar'
import { TabRouter } from './tab-router'

export function Shell(): JSX.Element {
  useCanvasPersistence()
  useTabsPersistence()
  useDropsPersistence()

  const closeTab = useTabs((s) => s.closeTab)
  const activeId = useTabs((s) => s.activeId)
  const setActive = useTabs((s) => s.setActive)
  const togglePalette = usePalette((s) => s.togglePalette)
  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const sidebarWidth = useUi((s) => s.sidebarWidth)
  const setSidebarWidth = useUi((s) => s.setSidebarWidth)
  const resetSidebarWidth = useUi((s) => s.resetSidebarWidth)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const conversationsLoaded = useSidebarData((s) => s.conversationsLoaded)
  const worktreesLoaded = useSidebarData((s) => s.worktreesLoaded)
  const sidebarLoading = !!activeWorkspaceId && (!conversationsLoaded || !worktreesLoaded)

  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    invoke('window:isMaximized', {}).then((r) => setMaximized(r.maximized))
    return onEvent('window:maximized-change', (e) => setMaximized(e.maximized))
  }, [])

  useEffect(() => {
    return onEvent('pty:exit', (p) => {
      useSessions.getState().markExited(p.ptyId, p.exitCode)
      const { windows, removeWindow } = useCanvas.getState()
      for (const w of windows) {
        if (w.sessionId === p.ptyId) removeWindow(w.id)
      }
    })
  }, [])

  useEffect(() => {
    return onEvent('worktree:cleaned', (p) => {
      const name = p.worktreePath.split('/').slice(-2).join('/')
      if (p.action === 'deleted') {
        toast.success(`Cleaned up unused worktree ${name}`, {
          description: `Branch ${p.branch} was empty; removed.`,
        })
      } else {
        toast.info(`Kept worktree ${name}`, {
          description: `Branch ${p.branch} had work; promoted.`,
        })
      }
    })
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod) return
      if (ev.key === 'k' || ev.key === 'K') {
        ev.preventDefault()
        togglePalette()
      } else if (ev.key === 'w' || ev.key === 'W') {
        ev.preventDefault()
        const isDirty = usePlanTabUi.getState().byTab[activeId]?.dirty ?? false
        if (isDirty) {
          usePlanTabUi.getState().setPendingCloseId(activeId)
        } else {
          closeTab(activeId)
        }
      } else if (ev.key === 'b' || ev.key === 'B') {
        ev.preventDefault()
        toggleSidebar()
      } else if (ev.key === 'Tab') {
        const { tabs, activeId: curr } = useTabs.getState()
        if (tabs.length < 2) return
        ev.preventDefault()
        const idx = tabs.findIndex((t) => t.id === curr)
        if (idx < 0) return
        const delta = ev.shiftKey ? -1 : 1
        const next = tabs[(idx + delta + tabs.length) % tabs.length]
        if (next) setActive(next.id)
      } else if (ev.shiftKey && (ev.key === 'f' || ev.key === 'F')) {
        // Ctrl/Cmd+Shift+F: toggle maximize for the focused terminal.
        // Only fires on the Board tab where the canvas is visible.
        const tabsState = useTabs.getState()
        if (tabsState.activeId !== 'board') return
        const ws = useWorkspaces.getState().activeId
        if (!ws) return
        const { byWorkspace, set: setMaximized } = useMaximizedWindow.getState()
        const current = byWorkspace[ws] ?? null
        if (current) {
          ev.preventDefault()
          setMaximized(ws, null)
          return
        }
        const wins = useCanvas.getState().windows
        if (wins.length === 0) return
        const top = wins.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b))
        ev.preventDefault()
        setMaximized(ws, top.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, closeTab, togglePalette, toggleSidebar, setActive])

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex h-screen w-screen flex-col overflow-hidden border border-border bg-background ring-1 ring-black',
          maximized ? '' : 'm-px h-[calc(100vh-2px)] w-[calc(100vw-2px)] rounded-lg',
        )}
      >
        <div
          className={cn(
            'grid min-h-0 flex-1 grid-rows-1 text-foreground',
            resizingSidebar ? 'transition-none' : 'transition-[grid-template-columns] duration-150',
          )}
          style={{
            gridTemplateColumns: sidebarVisible
              ? `${sidebarWidth}px 1px minmax(0,1fr)`
              : '40px 0px minmax(0,1fr)',
          }}
        >
          <div className="overflow-hidden">
            <Sidebar />
          </div>
          {sidebarVisible ? (
            <VerticalResizer
              side="right"
              width={sidebarWidth}
              onWidth={setSidebarWidth}
              onReset={resetSidebarWidth}
              onResizeStart={() => setResizingSidebar(true)}
              onResizeEnd={() => setResizingSidebar(false)}
            />
          ) : (
            <div />
          )}
          <div className="grid min-w-0 grid-rows-[40px_minmax(0,1fr)_24px]">
            <HeaderTabs maximized={maximized} />
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden [&>*]:h-full">
              <TabRouter />
            </div>
            <Statusbar />
          </div>
        </div>
      </div>
      <CommandPalette />
      <PromptsModal />
      <SettingsModal />
      <SpawnModal />
      {sidebarLoading ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm lowercase text-muted-foreground/60">cc-ide</span>
            <PixelGridLoader className="mb-[2px]" />
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  )
}
