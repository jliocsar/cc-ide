import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitCompare,
  ListChecks,
  MessageSquareText,
  MessagesSquare,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Terminal,
  Trash2,
  TreePine,
} from 'lucide-react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { invoke, onEvent } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { MAX_WINDOWS_PER_WORKSPACE, useCanvas } from '@/state/canvas'
import { selectDropsFor, useDrops } from '@/state/drops'
import { usePlansTree } from '@/state/plans-tree'
import { usePromptsTree } from '@/state/prompts-tree'
import { useSessions } from '@/state/sessions'
import { useSidebarData } from '@/state/sidebar-data'
import { useSpawnModal } from '@/state/spawn-modal'
import { useTabs } from '@/state/tabs'
import { useUi } from '@/state/ui'
import { useWorkspaces } from '@/state/workspaces'
import { ConversationsSection } from './sections/conversations-section'
import { DiffsSection } from './sections/diffs-section'
import { DropsSection } from './sections/drops-section'
import { PlanCreateDialog, PlansSection } from './sections/plans-section'
import { PromptCreateDialog, PromptsSection } from './sections/prompts-section'
import { SessionsSection } from './sections/sessions-section'
import { CreateWorktreeDialog, WorktreesSection } from './sections/worktrees-section'

export function Sidebar(): JSX.Element {
  const { workspaces, activeId, loaded, refresh, pickAndAdd, setActive, remove } = useWorkspaces()
  const worktrees = useSidebarData((s) => s.worktrees)
  const clearSidebar = useSidebarData((s) => s.clear)
  const sessions = useSessions((s) => s.sessions)
  const liveCountByWorkspace = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions) {
      if (s.exited) continue
      counts.set(s.workspaceId, (counts.get(s.workspaceId) ?? 0) + 1)
    }
    return counts
  }, [sessions])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!activeId) clearSidebar()
  }, [activeId, clearSidebar])

  useEffect(() => {
    if (!activeId) return
    const { refreshConversations, refreshWorktrees } = useSidebarData.getState()
    void refreshConversations(activeId)
    void refreshWorktrees(activeId)
  }, [activeId])

  useEffect(() => {
    if (!activeId) return
    const state = useSidebarData.getState()
    const plansState = usePlansTree.getState()
    const promptsState = usePromptsTree.getState()
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
      onEvent('prompts:changed', (p) => {
        if (p.workspaceId === activeId) void promptsState.refresh()
      }),
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [activeId])

  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const sidebarWidth = useUi((s) => s.sidebarWidth)
  const toggleSidebar = useUi((s) => s.toggleSidebar)

  if (!sidebarVisible) {
    return (
      <aside className="flex h-full w-10 min-h-0 flex-col items-center overflow-hidden border-r border-border bg-card py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar · Ctrl+B</TooltipContent>
        </Tooltip>
      </aside>
    )
  }

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card"
      style={{ width: sidebarWidth }}
    >
      <div
        className="flex h-10 shrink-0 items-center gap-2 border-b border-border pl-3 pr-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties & Record<string, string>}
      >
        <span>cc-ide</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="ml-auto"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & Record<string, string>}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Collapse sidebar · Ctrl+B</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block [&>[data-slot=scroll-area-viewport]>div]:!w-full [&>[data-slot=scroll-area-viewport]>div]:!min-w-0">
        <Accordion type="multiple" defaultValue={[]} className="w-full pb-4">
          <AccordionItem value="workspaces" className="border-b-0">
            <SidebarSectionHeader
              icon={FolderGit2}
              label="Workspaces"
              count={loaded ? workspaces.length : undefined}
              primaryAction={
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
                  <div className="px-3 py-1 text-[11px] text-muted-foreground">
                    no workspaces yet
                  </div>
                ) : (
                  workspaces.map((w) => {
                    const active = w.id === activeId
                    const liveCount = liveCountByWorkspace.get(w.id) ?? 0
                    return (
                      <ContextMenu key={w.id}>
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              'group flex items-center gap-2 px-3 py-1 text-[11px] transition-colors',
                              active
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setActive(w.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  {active ? (
                                    <CheckCircle2 className="size-3 shrink-0" />
                                  ) : (
                                    <Circle className="size-3 shrink-0" />
                                  )}
                                  <span className="truncate font-mono">{w.name}</span>
                                  {liveCount > 0 ? (
                                    <span
                                      className="shrink-0 rounded-sm bg-muted px-1 py-px font-mono text-[9px] leading-none tabular-nums text-muted-foreground"
                                      title={`${liveCount} live session${liveCount === 1 ? '' : 's'}`}
                                    >
                                      {liveCount}
                                    </span>
                                  ) : null}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right">{w.path}</TooltipContent>
                            </Tooltip>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Remove "${w.name}" from cc-ide?\nFiles on disk are NOT deleted.`,
                                  )
                                ) {
                                  void remove(w.id)
                                }
                              }}
                              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                              aria-label="Remove workspace"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {!active ? (
                            <ContextMenuItem onSelect={() => setActive(w.id)}>
                              <CheckCircle2 />
                              Set active
                            </ContextMenuItem>
                          ) : null}
                          <ContextMenuItem
                            onSelect={() => {
                              void invoke('shell:showItemInFolder', { absolutePath: w.path })
                            }}
                          >
                            <FolderOpen />
                            Reveal in Finder
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => {
                              void invoke('clipboard:write', { text: w.path }).then(() =>
                                toast.success('Copied path'),
                              )
                            }}
                          >
                            <Copy />
                            Copy path
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            onSelect={() => {
                              if (
                                confirm(
                                  `Remove "${w.name}" from cc-ide?\nFiles on disk are NOT deleted.`,
                                )
                              ) {
                                void remove(w.id)
                              }
                            }}
                          >
                            <Trash2 />
                            Remove
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
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
              <PromptsAccordion workspaceId={activeId} />
              <AccordionItem value="diffs" className="border-b-0">
                <SidebarSectionHeader icon={GitCompare} label="Diffs" />
                <AccordionContent className="pb-0">
                  <DiffsSection worktrees={worktrees} />
                </AccordionContent>
              </AccordionItem>
              <DropsAccordion workspaceId={activeId} />
            </>
          ) : null}
        </Accordion>
      </ScrollArea>
      <SidebarFooter hasWorkspace={!!activeId} />
    </aside>
  )
}

function SidebarFooter({ hasWorkspace }: { hasWorkspace: boolean }): JSX.Element {
  const openSettings = useTabs((s) => s.openSettings)
  const button = (
    <button
      type="button"
      disabled={!hasWorkspace}
      onClick={() => openSettings()}
      className={cn(
        'flex h-10 w-full items-center gap-2 border-t border-border bg-card pl-3 pr-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
        hasWorkspace
          ? 'cursor-pointer text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          : 'cursor-not-allowed text-muted-foreground/40',
      )}
      aria-label="Open Settings"
    >
      <SettingsIcon className="size-3.5 shrink-0" />
      <span>Settings</span>
    </button>
  )
  if (hasWorkspace) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top">Pick a workspace first</TooltipContent>
    </Tooltip>
  )
}

function SessionsAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const openSpawnModal = useSpawnModal((s) => s.open)
  const modalOpen = useSpawnModal((s) => s.isOpen)
  const atCap = useCanvas((s) => s.windows.length >= MAX_WINDOWS_PER_WORKSPACE)

  return (
    <AccordionItem value="sessions" className="border-b-0">
      <SidebarSectionHeader
        icon={Terminal}
        label="Sessions"
        primaryAction={
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={modalOpen || atCap}
            onClick={(e) => {
              e.stopPropagation()
              openSpawnModal()
            }}
            aria-label={atCap ? `At ${MAX_WINDOWS_PER_WORKSPACE}-terminal cap` : 'New session'}
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
  const atCap = useCanvas((s) => s.windows.length >= MAX_WINDOWS_PER_WORKSPACE)

  return (
    <AccordionItem value="conversations" className="border-b-0">
      <SidebarSectionHeader
        icon={MessagesSquare}
        label="Conversations"
        count={status === 'loading' ? '…' : conversations.length}
        primaryAction={
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={modalOpen || atCap}
            onClick={(e) => {
              e.stopPropagation()
              openSpawnModal()
            }}
            aria-label={atCap ? `At ${MAX_WINDOWS_PER_WORKSPACE}-terminal cap` : 'New session'}
          >
            <Plus />
          </Button>
        }
        menu={
          <>
            <ContextMenuItem onSelect={() => void refresh(workspaceId)}>
              <RefreshCw />
              Refresh
            </ContextMenuItem>
            <ContextMenuItem disabled={modalOpen || atCap} onSelect={() => openSpawnModal()}>
              <Plus />
              New session
            </ContextMenuItem>
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
      <SidebarSectionHeader
        icon={TreePine}
        label="Worktrees"
        count={status === 'loading' ? '…' : worktrees.length}
        primaryAction={
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
        }
        menu={
          <>
            <ContextMenuItem onSelect={() => void refresh(workspaceId)}>
              <RefreshCw />
              Refresh
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus />
              New worktree
            </ContextMenuItem>
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
  const refresh = usePlansTree((s) => s.refresh)
  const [createOpen, setCreateOpen] = useState<null | { mode: 'file' | 'folder'; parent: string }>(
    null,
  )

  return (
    <AccordionItem value="plans" className="border-b-0">
      <SidebarSectionHeader
        icon={ListChecks}
        label="Plans"
        primaryAction={
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
        }
        menu={
          <>
            <ContextMenuItem onSelect={() => void refresh()}>
              <RefreshCw />
              Refresh
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateOpen({ mode: 'folder', parent: '' })}>
              <FolderPlus />
              New folder
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateOpen({ mode: 'file', parent: '' })}>
              <Plus />
              New plan
            </ContextMenuItem>
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

function PromptsAccordion({ workspaceId }: { workspaceId: string }): JSX.Element {
  const refresh = usePromptsTree((s) => s.refresh)
  const [createOpen, setCreateOpen] = useState<null | { mode: 'file' | 'folder'; parent: string }>(
    null,
  )

  return (
    <AccordionItem value="prompts" className="border-b-0">
      <SidebarSectionHeader
        icon={MessageSquareText}
        label="Prompts"
        primaryAction={
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              setCreateOpen({ mode: 'file', parent: '' })
            }}
            aria-label="New prompt"
          >
            <Plus />
          </Button>
        }
        menu={
          <>
            <ContextMenuItem onSelect={() => void refresh()}>
              <RefreshCw />
              Refresh
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateOpen({ mode: 'folder', parent: '' })}>
              <FolderPlus />
              New folder
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateOpen({ mode: 'file', parent: '' })}>
              <Plus />
              New prompt
            </ContextMenuItem>
          </>
        }
      />
      <AccordionContent className="pb-0">
        <PromptsSection workspaceId={workspaceId} onCreateFromRow={setCreateOpen} />
      </AccordionContent>
      <PromptCreateDialog
        open={createOpen !== null}
        request={createOpen}
        onClose={() => setCreateOpen(null)}
        workspaceId={workspaceId}
      />
    </AccordionItem>
  )
}

function DropsAccordion({ workspaceId }: { workspaceId: string }): JSX.Element | null {
  const entries = useDrops(selectDropsFor(workspaceId))
  const clear = useDrops((s) => s.clear)
  if (entries.length === 0) return null
  return (
    <AccordionItem value="drops" className="border-b-0">
      <SidebarSectionHeader
        icon={MessageSquareText}
        label="Drops"
        count={entries.length}
        menu={
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              if (confirm(`Clear all ${entries.length} drop(s)?`)) clear(workspaceId)
            }}
          >
            <Trash2 />
            Clear all
          </ContextMenuItem>
        }
      />
      <AccordionContent className="pb-0">
        <DropsSection workspaceId={workspaceId} />
      </AccordionContent>
    </AccordionItem>
  )
}

function SidebarSectionHeader({
  icon: Icon,
  label,
  count,
  primaryAction,
  menu,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count?: number | string
  primaryAction?: React.ReactNode
  menu?: React.ReactNode
}): JSX.Element {
  const trigger = (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className="group flex h-8 w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden rounded-none bg-muted/40 px-2 py-0 geist-features select-none text-[11px] font-medium uppercase [letter-spacing:1px] [line-height:14.5px] text-foreground/40 [font-family:var(--font-mono)] outline-none hover:bg-muted/60 hover:no-underline data-[state=open]:bg-muted/50"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-[11px] normal-case tracking-normal opacity-70">
          ({count})
        </span>
      ) : null}
      <span className="flex-1" />
      {primaryAction ? (
        <span
          className="flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {primaryAction}
        </span>
      ) : null}
      <ChevronDown className="pointer-events-none size-3 shrink-0 text-foreground/40 transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  )

  return (
    <AccordionPrimitive.Header className="flex">
      {menu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
          <ContextMenuContent>{menu}</ContextMenuContent>
        </ContextMenu>
      ) : (
        trigger
      )}
    </AccordionPrimitive.Header>
  )
}
