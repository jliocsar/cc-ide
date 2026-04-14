import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from './sidebar'
import { HeaderTabs } from './header-tabs'
import { TabRouter } from './tab-router'
import { Statusbar } from './statusbar'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { useTabs } from '@/state/tabs'

export function Shell(): JSX.Element {
  useCanvasPersistence()

  const closeTab = useTabs((s) => s.closeTab)
  const activeId = useTabs((s) => s.activeId)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'w') {
        ev.preventDefault()
        closeTab(activeId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, closeTab])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid h-full grid-cols-[260px_1fr] grid-rows-1 bg-background text-foreground">
        <Sidebar />
        <div className="grid min-w-0 grid-rows-[40px_1fr_24px]">
          <HeaderTabs />
          <TabRouter />
          <Statusbar />
        </div>
      </div>
    </TooltipProvider>
  )
}
