import { useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { FolderGit2, Plus, CheckCircle2, Circle } from 'lucide-react'
import { useWorkspaces } from '@/state/workspaces'
import { cn } from '@/lib/utils'

export function Sidebar(): JSX.Element {
  const { workspaces, activeId, loaded, refresh, pickAndAdd, setActive } = useWorkspaces()

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 items-center justify-between px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>cc-ide</span>
      </div>
      <Separator />

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <FolderGit2 className="size-3.5" />
          <span>Workspaces</span>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => void pickAndAdd()}
          aria-label="Add workspace"
        >
          <Plus />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-px px-2 pb-2">
          {!loaded ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">loading…</div>
          ) : workspaces.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">no workspaces yet</div>
          ) : (
            workspaces.map((w) => {
              const active = w.id === activeId
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setActive(w.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {active ? <CheckCircle2 className="size-3.5 shrink-0" /> : <Circle className="size-3.5 shrink-0" />}
                  <span className="truncate font-mono text-[12px]">{w.name}</span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
