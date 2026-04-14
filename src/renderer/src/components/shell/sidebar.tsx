import { useEffect } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  FolderGit2,
  Plus,
  CheckCircle2,
  Circle,
  Terminal,
  GitBranch,
  ListChecks,
  GitCompare,
} from 'lucide-react'
import { useWorkspaces } from '@/state/workspaces'
import { useSidebarData } from '@/state/sidebar-data'
import { SessionsSection } from './sections/sessions-section'
import { WorktreesSection } from './sections/worktrees-section'
import { DiffsSection } from './sections/diffs-section'
import { cn } from '@/lib/utils'

export function Sidebar(): JSX.Element {
  const { workspaces, activeId, loaded, refresh, pickAndAdd, setActive } = useWorkspaces()
  const worktrees = useSidebarData((s) => s.worktrees)
  const clearSidebar = useSidebarData((s) => s.clear)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!activeId) clearSidebar()
  }, [activeId, clearSidebar])

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        cc-ide
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={['workspaces', 'sessions', 'worktrees']}
          className="px-1 pb-4"
        >
          <AccordionItem value="workspaces" className="border-b-0">
            <SectionHeader icon={FolderGit2} label="Workspaces">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  void pickAndAdd()
                }}
                aria-label="Add workspace"
              >
                <Plus />
              </Button>
            </SectionHeader>
            <AccordionContent className="pb-2">
              <div className="flex flex-col gap-px">
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
                        title={w.path}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors',
                          active
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        {active ? (
                          <CheckCircle2 className="size-3 shrink-0" />
                        ) : (
                          <Circle className="size-3 shrink-0" />
                        )}
                        <span className="truncate font-mono text-[12px]">{w.name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {activeId ? (
            <>
              <AccordionItem value="sessions" className="border-b-0">
                <SectionHeader icon={Terminal} label="Sessions" />
                <AccordionContent className="pb-2">
                  <SessionsSection workspaceId={activeId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="worktrees" className="border-b-0">
                <SectionHeader icon={GitBranch} label="Worktrees" />
                <AccordionContent className="pb-2">
                  <WorktreesSection workspaceId={activeId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="plans" className="border-b-0">
                <SectionHeader icon={ListChecks} label="Plans" />
                <AccordionContent className="pb-2">
                  <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    plan tree · coming in phase 4
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="diffs" className="border-b-0">
                <SectionHeader icon={GitCompare} label="Diffs" />
                <AccordionContent className="pb-2">
                  <DiffsSection worktrees={worktrees} />
                </AccordionContent>
              </AccordionItem>
            </>
          ) : null}
        </Accordion>
      </ScrollArea>
    </aside>
  )
}

function SectionHeader({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children?: React.ReactNode
}): JSX.Element {
  return (
    <AccordionTrigger
      className="group flex h-7 items-center justify-between rounded-md px-2 py-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent/30 hover:no-underline"
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      {children ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </AccordionTrigger>
  )
}
