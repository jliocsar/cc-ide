import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from './sidebar'
import { HeaderTabs } from './header-tabs'
import { TabRouter } from './tab-router'
import { Statusbar } from './statusbar'
import { CommandPalette } from '@/components/palette/command-palette'
import { PromptsModal } from '@/components/palette/prompts-modal'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { useTabsPersistence } from '@/hooks/use-tabs-persistence'
import { useTabs } from '@/state/tabs'
import { usePalette } from '@/state/palette'
import { useUi } from '@/state/ui'
import { useSessions } from '@/state/sessions'
import { useCanvas } from '@/state/canvas'
import { onEvent } from '@/lib/ipc'
import { cn } from '@/lib/utils'

export function Shell(): JSX.Element {
  useCanvasPersistence()
  useTabsPersistence()

  const closeTab = useTabs((s) => s.closeTab)
  const activeId = useTabs((s) => s.activeId)
  const togglePalette = usePalette((s) => s.togglePalette)
  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const toggleSidebar = useUi((s) => s.toggleSidebar)

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
    const onKey = (ev: KeyboardEvent) => {
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod) return
      if (ev.key === 'k' || ev.key === 'K') {
        ev.preventDefault()
        togglePalette()
      } else if (ev.key === 'w' || ev.key === 'W') {
        ev.preventDefault()
        closeTab(activeId)
      } else if (ev.key === 'b' || ev.key === 'B') {
        ev.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, closeTab, togglePalette, toggleSidebar])

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'grid h-full grid-rows-1 bg-background text-foreground transition-[grid-template-columns] duration-150',
          sidebarVisible ? 'grid-cols-[260px_1fr]' : 'grid-cols-[0_1fr]',
        )}
      >
        <div className="overflow-hidden">
          <Sidebar />
        </div>
        <div className="grid min-w-0 grid-rows-[40px_minmax(0,1fr)_24px]">
          <HeaderTabs />
          <div className="grid min-h-0 overflow-hidden [&>*]:h-full">
            <TabRouter />
          </div>
          <Statusbar />
        </div>
      </div>
      <CommandPalette />
      <PromptsModal />
    </TooltipProvider>
  )
}
