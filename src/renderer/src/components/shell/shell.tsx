import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from './sidebar'
import { HeaderTabs } from './header-tabs'
import { Canvas } from '@/components/canvas/canvas'
import { Statusbar } from './statusbar'

export function Shell(): JSX.Element {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid h-full grid-cols-[260px_1fr] grid-rows-1 bg-background text-foreground">
        <Sidebar />
        <div className="grid min-w-0 grid-rows-[40px_1fr_24px]">
          <HeaderTabs />
          <Canvas />
          <Statusbar />
        </div>
      </div>
    </TooltipProvider>
  )
}
