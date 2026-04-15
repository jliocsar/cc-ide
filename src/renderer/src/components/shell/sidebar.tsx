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
  MessagesSquare,
  TreePine,
  ListChecks,
  GitCompare,
  Trash2,
  RefreshCw,
  FolderPlus,
  Terminal,
} from 'lucide-react'
import { useWorkspaces } from '@/state/workspaces'
import { useSidebarData } from '@/state/sidebar-data'
import { usePlansTree } from '@/state/plans-tree'
import { onEvent } from '@/lib/ipc'
import { ConversationsSection } from './sections/conversations-section'
import { SessionsSection } from './sections/sessions-section'
import {
  WorktreesSection,
  CreateWorktreeDialog,
} from './sections/worktrees-section'
import { DiffsSection } from './sections/diffs-section'
import { PlansSection, PlanCreateDialog } from './sections/plans-section'
import { useSpawnModal } from '@/state/spawn-modal'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export function Sidebar(): JSX.Element {
  const { workspaces, activeId, loaded, refresh, pickAndAdd, setActive, remove } = useWorkspaces()
  const worktrees = useSidebarData((s) => s.worktrees)
  const clearSidebar = useSidebarData((s) => s.clear)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!activeId) clearSidebar()
  }, [activeId, clearSidebar])

  useEffect(() => {
    if (!activeId) return
    const state = useSidebarData.getState()
    const plansState = usePlansTree.getState()
    const unsubs = [
      onEvent('conversations:changed', (p) => {
        if (p.workspaceId === activeId) void state.refreshConversations(activeId)
      }),
      onEvent('worktrees:changed', (p) => {
        if (p.workspaceId === activeId) void state.refreshWorktrees(activeId)
      }),
      onEvent('plans:changed', (p) => {
        if (p.workspaceId === activeId) void plansState.refresh()
      }),
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [activeId])

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        cc-ide
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block [&>[data-slot=scroll-area-viewport]>div]:!w-full [&>[data-slot=scroll-area-viewport]>div]:!min-w-0">
        <Accordion
          type="multiple"
          defaultValue={[]}
          className="w-full pb-4"
        >
          <AccordionItem value="workspaces" className="border-b-0">
            <SectionHeader
              icon={FolderGit2}
              label="Workspaces"
              count={loaded ? workspaces.length : undefined}
              actions={
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
              }
            />
            <AccordionContent className="pb-0">
              <div className="flex flex-col gap-px">
                {!loaded ? (
                  <div className="px-3 py-1 text-[11px] text-muted-foreground">loading…</div>
                ) : workspaces.length === 0 ? (
                  <div className="px-3 py-1 text-[11px] text-muted-foreground">no workspaces yet</div>
                ) : (
                  workspaces.map((w) => {
                    const active = w.id === activeId
                    return (
                      <div
                        key={w.id}
                        className={cn(
                          'group flex items-center gap-2 px-3 py-1 transition-colors',
                          active
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setActive(w.id)}
                          title={w.path}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        >
                          {active ? (
                            <CheckCircle2 className="size-3 shrink-0" />
                          ) : (
                            <Circle className="size-3 shrink-0" />
                          )}
                          <span className="truncate font-mono text-[12px]">{w.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remove "${w.name}" from cc-ide?\nFiles on disk are NOT deleted.`)) {
                              void remove(w.id)
                            }
                          }}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                          aria-label="Remove workspace"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {activeId ? (
            <>
              <SessionsAccordion workspaceId={activeId} />
              <ConversationsAccordion workspaceId={activeId} />
              <WorktreesAccordion workspaceId={activeId} />
              <PlansAccordion workspaceId={activeId} />
              <AccordionItem value="diffs" className="border-b-0">
                <SectionHeader icon={GitCompare} label="Diffs" />
                <AccordionContent className="pb-0">
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

function SessionsAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)

  return (
    <AccordionItem value="sessions" className="border-b-0">
      <SectionHeader
        icon={Terminal}
        label="Sessions"
        actions={
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={modalOpen}
            onClick={(e) => {
              e.stopPropagation()
              openSpawnModal()
            }}
            aria-label="New session"
          >
            <Plus />
          </Button>
        }
      />
      <AccordionContent className="pb-0">
        <SessionsSection workspaceId={workspaceId} />
      </AccordionContent>
    </AccordionItem>
  )
}

function ConversationsAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const conversations = useSidebarData((s) => s.conversations)
  const status = useSidebarData((s) => s.conversationsStatus)
  const refresh = useSidebarData((s) => s.refreshConversations)
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)

  return (
    <AccordionItem value="conversations" className="border-b-0">
      <SectionHeader
        icon={MessagesSquare}
        label="Conversations"
        count={status === 'loading' ? '…' : conversations.length}
        actions={
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                void refresh(workspaceId)
              }}
              aria-label="Refresh conversations"
            >
              <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={modalOpen}
              onClick={(e) => {
                e.stopPropagation()
                openSpawnModal()
              }}
              aria-label="New session"
            >
              <Plus />
            </Button>
          </>
        }
      />
      <AccordionContent className="pb-0">
        <ConversationsSection workspaceId={workspaceId} />
      </AccordionContent>
    </AccordionItem>
  )
}

function WorktreesAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const worktrees = useSidebarData((s) => s.worktrees)
  const status = useSidebarData((s) => s.worktreesStatus)
  const refresh = useSidebarData((s) => s.refreshWorktrees)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <AccordionItem value="worktrees" className="border-b-0">
      <SectionHeader
        icon={TreePine}
        label="Worktrees"
        count={status === 'loading' ? '…' : worktrees.length}
        actions={
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                void refresh(workspaceId)
              }}
              aria-label="Refresh worktrees"
            >
              <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setCreateOpen(true)
              }}
              aria-label="New worktree"
            >
              <Plus />
            </Button>
          </>
        }
      />
      <AccordionContent className="pb-0">
        <WorktreesSection workspaceId={workspaceId} />
      </AccordionContent>
      <CreateWorktreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </AccordionItem>
  )
}

function PlansAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const status = usePlansTree((s) => s.status)
  const refresh = usePlansTree((s) => s.refresh)
  const [createOpen, setCreateOpen] = useState<null | { mode: 'file' | 'folder'; parent: string }>(null)

  return (
    <AccordionItem value="plans" className="border-b-0">
      <SectionHeader
        icon={ListChecks}
        label="Plans"
        actions={
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                void refresh()
              }}
              aria-label="Refresh plans"
            >
              <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setCreateOpen({ mode: 'folder', parent: '' })
              }}
              aria-label="New folder"
            >
              <FolderPlus />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setCreateOpen({ mode: 'file', parent: '' })
              }}
              aria-label="New plan"
            >
              <Plus />
            </Button>
          </>
        }
      />
      <AccordionContent className="pb-0">
        <PlansSection workspaceId={workspaceId} onCreateFromRow={setCreateOpen} />
      </AccordionContent>
      <PlanCreateDialog
        open={createOpen !== null}
        request={createOpen}
        onClose={() => setCreateOpen(null)}
        workspaceId={workspaceId}
      />
    </AccordionItem>
  )
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count?: number | string
  actions?: React.ReactNode
}): JSX.Element {
  return (
    <AccordionTrigger className="group flex h-8 w-full items-center justify-start gap-1.5 rounded-none bg-muted/40 px-3 py-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/60 hover:no-underline data-[state=open]:bg-muted/50">
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">
          ({count})
        </span>
      ) : null}
      <span className="flex-1" />
      {actions ? (
        <div
          className="flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </AccordionTrigger>
  )
}
