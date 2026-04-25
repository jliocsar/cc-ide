import {
  ChevronDown,
  Copy,
  FileText,
  FlaskConical,
  GitCompare,
  LayoutGrid,
  MessageSquare,
  Minimize2,
  Minus,
  Network,
  Settings as SettingsIcon,
  Square,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import claudeSymbolUrl from '@/assets/claude-symbol.svg'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type DropPayload, setDropPayload } from '@/lib/drop-payload'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { type BoardMode, resolveBoardMode, useBoardUi } from '@/state/board-ui'
import type { CanvasWindow } from '@/state/canvas'
import { useCanvas } from '@/state/canvas'
import { useMaximizedWindow } from '@/state/maximized-window'
import { usePlanTabUi } from '@/state/plan-tab-ui'
import type { SessionRecord } from '@/state/sessions'
import { useSessions } from '@/state/sessions'
import { type Tab, useTabs } from '@/state/tabs'
import { useWorkspaces } from '@/state/workspaces'

// Mirror teammate-window's color → tailwind palette so the maximized
// header chrome matches the inner chrome's pills.
const TEAMMATE_DOT_BY_COLOR: Record<string, string> = {
  black: 'bg-neutral-500',
  red: 'bg-red-400',
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  blue: 'bg-sky-400',
  magenta: 'bg-fuchsia-400',
  cyan: 'bg-cyan-400',
  white: 'bg-neutral-100',
}
const TEAMMATE_PILL_BY_COLOR: Record<string, string> = {
  black: 'bg-neutral-500/20 text-neutral-300',
  red: 'bg-red-400/15 text-red-300',
  green: 'bg-emerald-400/15 text-emerald-300',
  yellow: 'bg-amber-400/15 text-amber-300',
  blue: 'bg-sky-400/15 text-sky-300',
  magenta: 'bg-fuchsia-400/15 text-fuchsia-300',
  cyan: 'bg-cyan-400/15 text-cyan-300',
  white: 'bg-neutral-100/20 text-neutral-200',
}

type MaximizedChrome = {
  icon: ReactNode
  title: string
  suffix: ReactNode | null
  badge: ReactNode
}

function buildMaximizedChrome(
  w: CanvasWindow,
  session: SessionRecord | undefined,
): MaximizedChrome {
  const kind = w.kind ?? 'claude'
  const shortName = w.tmuxWindow.split(':').slice(1).join(':') || w.tmuxWindow

  if (kind === 'teammate') {
    const meta = w.agentMeta
    const agentColor = meta?.agentColor ?? null
    const teamName = meta?.teamName ?? null
    const agentName = meta?.agentName ?? null
    const dotClass = agentColor
      ? (TEAMMATE_DOT_BY_COLOR[agentColor] ?? 'bg-muted-foreground')
      : 'bg-muted-foreground'
    const pillClass = agentColor
      ? (TEAMMATE_PILL_BY_COLOR[agentColor] ?? 'bg-muted text-muted-foreground')
      : 'bg-muted text-muted-foreground'
    return {
      icon: (
        <span className={cn('inline-block size-2.5 shrink-0 rounded-full', dotClass)} aria-hidden />
      ),
      title: agentName && teamName ? `${agentName}@${teamName}` : w.title,
      suffix: <span className="font-mono text-[10px] text-muted-foreground/80">(teammate)</span>,
      badge: (
        <>
          {teamName ? (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', pillClass)}>
              {teamName}
            </span>
          ) : null}
          {w.exited ? (
            <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              closed
            </span>
          ) : null}
        </>
      ),
    }
  }

  if (kind === 'subagent') {
    const meta = w.agentMeta
    return {
      icon: <img src={claudeSymbolUrl} alt="" className="size-3.5 shrink-0" />,
      title: meta ? `${meta.agentType ?? 'subagent'}:${meta.agentId.slice(0, 8)}` : w.title,
      suffix: null,
      badge: (
        <>
          {w.exited ? (
            <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              done
            </span>
          ) : (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
              ● running
            </span>
          )}
          {meta?.teammateName ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              via {meta.teammateName}
            </span>
          ) : null}
        </>
      ),
    }
  }

  // Claude (default).
  const dormant = w.sessionId === null
  return {
    icon: <img src={claudeSymbolUrl} alt="" className="size-3.5 shrink-0" />,
    title: shortName,
    suffix: null,
    badge: (
      <>
        {dormant ? (
          <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            dormant
          </span>
        ) : session?.exited ? (
          <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-medium tabular-nums text-destructive">
            exit {session.exitCode ?? '—'}
          </span>
        ) : (
          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
            ● live
          </span>
        )}
        {session?.worktreeBranch ? (
          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
            {session.worktreeBranch}
          </span>
        ) : null}
      </>
    ),
  }
}

const TAB_REORDER_MIME = 'application/x-cc-ide-tab-reorder'

let cachedTransparentDragImage: HTMLImageElement | null = null

function transparentDragImage(): HTMLImageElement {
  if (cachedTransparentDragImage) return cachedTransparentDragImage
  const img = new Image()
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  cachedTransparentDragImage = img
  return img
}

function dragPayloadFor(tab: Tab): DropPayload | null {
  if (tab.kind === 'plan')
    return {
      kind: 'plan',
      workspaceId: tab.meta.workspaceId,
      relPath: tab.meta.relPath,
    }
  if (tab.kind === 'diff')
    return {
      kind: 'diff',
      workspaceId: tab.meta.workspaceId,
      worktreePath: tab.meta.worktreePath,
      path: tab.meta.path,
      stage: tab.meta.stage,
    }
  return null
}

const ICON_BY_KIND: Record<Tab['kind'], React.ComponentType<{ className?: string }>> = {
  board: LayoutGrid,
  plan: FileText,
  diff: GitCompare,
  prompt: MessageSquare,
  settings: SettingsIcon,
}

export function HeaderTabs({ maximized }: { maximized: boolean }): JSX.Element {
  const { tabs, activeId } = useTabs(useShallow((s) => ({ tabs: s.tabs, activeId: s.activeId })))
  const setActive = useTabs((s) => s.setActive)
  const closeTab = useTabs((s) => s.closeTab)
  const reorderTab = useTabs((s) => s.reorderTab)
  const { byTab: dirtyMap, pendingCloseId } = usePlanTabUi(
    useShallow((s) => ({ byTab: s.byTab, pendingCloseId: s.pendingCloseId })),
  )
  const setPendingCloseId = usePlanTabUi((s) => s.setPendingCloseId)
  const workspaceId = useWorkspaces((s) => s.activeId)
  const boardMode = useBoardUi((s) =>
    resolveBoardMode(workspaceId ? s.modeByWorkspace[workspaceId] : undefined),
  )
  const maximizedWindowId = useMaximizedWindow((s) =>
    workspaceId ? (s.byWorkspace[workspaceId] ?? null) : null,
  )
  const setMaximizedWindow = useMaximizedWindow((s) => s.set)
  const maximizedWindow = useCanvas((s) =>
    maximizedWindowId ? s.windows.find((w) => w.id === maximizedWindowId) : undefined,
  )
  const maximizedSession = useSessions((s) =>
    maximizedWindow?.sessionId
      ? s.sessions.find((x) => x.ptyId === maximizedWindow.sessionId)
      : undefined,
  )
  const isBoardActive = activeId === 'board'
  const showMaximizedBar = isBoardActive && maximizedWindowId !== null && !!maximizedWindow
  const maximizedChrome = maximizedWindow
    ? buildMaximizedChrome(maximizedWindow, maximizedSession)
    : null
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const startSentinelRef = useRef<HTMLDivElement | null>(null)
  const endSentinelRef = useRef<HTMLDivElement | null>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  useEffect(() => {
    const root = scrollRef.current
    const start = startSentinelRef.current
    const end = endSentinelRef.current
    if (!root || !start || !end) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === start) setAtStart(entry.isIntersecting)
          else if (entry.target === end) setAtEnd(entry.isIntersecting)
        }
      },
      { root, threshold: 1 },
    )
    io.observe(start)
    io.observe(end)
    return () => io.disconnect()
  }, [showMaximizedBar])

  function requestClose(id: string): void {
    const isDirty = dirtyMap[id]?.dirty ?? false
    if (isDirty) {
      setPendingCloseId(id)
      return
    }
    closeTab(id)
  }

  const noDrag: React.CSSProperties & Record<string, string> = {
    WebkitAppRegion: 'no-drag',
  }
  const drag: React.CSSProperties & Record<string, string> = {
    WebkitAppRegion: 'drag',
  }

  return (
    <div
      className="flex h-10 w-full min-w-0 items-center border-b border-border bg-card"
      style={drag}
    >
      {showMaximizedBar && maximizedChrome ? (
        <div
          className="flex h-full flex-1 items-center gap-2 px-3 font-mono text-[11px] text-muted-foreground"
          style={noDrag}
        >
          {/* Key on windowId so the icon+title+badge block remounts and
              crossfades when the user ctrl+scrolls between pages. */}
          <div
            key={maximizedWindowId ?? ''}
            className="flex min-w-0 flex-1 items-center gap-2 animate-[cc-fade-in_200ms_ease-out]"
          >
            {maximizedChrome.icon}
            <span className="truncate">{maximizedChrome.title}</span>
            {maximizedChrome.suffix}
            {maximizedChrome.badge}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (workspaceId) setMaximizedWindow(workspaceId, null)
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Restore window"
              >
                <Minimize2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Restore · Ctrl+Shift+F</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'relative flex h-full min-w-0 items-center',
              tabs.length > 1 ? 'border-r border-border' : null,
            )}
          >
            <div
              ref={scrollRef}
              className="scrollbar-none flex h-full min-w-0 items-center overflow-x-auto"
              style={noDrag}
            >
              <div ref={startSentinelRef} aria-hidden className="h-full w-px shrink-0" />
              {tabs.map((tab, i) => {
                const isBoard = tab.kind === 'board'
                const isLast = i === tabs.length - 1
                const Icon = isBoard
                  ? boardMode === 'graph'
                    ? Network
                    : boardMode === 'sandbox'
                      ? FlaskConical
                      : LayoutGrid
                  : ICON_BY_KIND[tab.kind]
                const title = isBoard
                  ? boardMode === 'graph'
                    ? 'Dependency Graph'
                    : boardMode === 'sandbox'
                      ? 'Dev Sandbox'
                      : 'Sessions'
                  : tab.title
                const active = tab.id === activeId
                const payload = dragPayloadFor(tab)
                const canReorder = !tab.pinned
                const dirty = dirtyMap[tab.id]?.dirty ?? false
                return (
                  <div
                    key={tab.id}
                    draggable={!!payload || canReorder}
                    onDragStart={(e) => {
                      if (payload) setDropPayload(e.dataTransfer, payload)
                      if (canReorder) {
                        e.dataTransfer.setData(TAB_REORDER_MIME, tab.id)
                        e.dataTransfer.setDragImage(transparentDragImage(), 0, 0)
                        setDraggingId(tab.id)
                      }
                      e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(TAB_REORDER_MIME)) return
                      if (tab.pinned) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (draggingId && draggingId !== tab.id) {
                        reorderTab(draggingId, tab.id)
                      }
                    }}
                    onDrop={(e) => {
                      const srcId = e.dataTransfer.getData(TAB_REORDER_MIME)
                      setDraggingId(null)
                      if (!srcId) return
                      e.preventDefault()
                      if (srcId !== tab.id) reorderTab(srcId, tab.id)
                    }}
                    onClick={() => setActive(tab.id)}
                    onAuxClick={(e) => {
                      if (e.button === 1 && !tab.pinned) requestClose(tab.id)
                    }}
                    className={cn(
                      'relative flex h-full shrink-0 cursor-pointer select-none items-center gap-2 px-3 text-xs',
                      isLast && tabs.length > 1 ? null : 'border-r border-border',
                      active
                        ? 'bg-background text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                      draggingId === tab.id ? 'opacity-60' : null,
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="max-w-[200px] truncate font-mono">
                      {dirty ? <span className="mr-1 text-foreground">•</span> : null}
                      {title}
                    </span>
                    {tab.kind === 'board' ? <BoardModeChevron /> : null}
                    {!tab.pinned ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          requestClose(tab.id)
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Close tab"
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </div>
                )
              })}
              <div ref={endSentinelRef} aria-hidden className="h-full w-px shrink-0" />
            </div>
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent transition-opacity duration-150',
                atStart ? 'opacity-0' : 'opacity-100',
              )}
            />
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent transition-opacity duration-150',
                atEnd ? 'opacity-0' : 'opacity-100',
              )}
            />
          </div>
          <div className="h-full flex-1" style={drag} />
        </>
      )}
      {/* Window controls */}
      <div className="flex h-full shrink-0 items-center" style={noDrag}>
        <button
          type="button"
          onClick={() => void invoke('window:minimize', {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Minimize"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void invoke('window:maximize', {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
        </button>
        <button
          type="button"
          onClick={() => void invoke('window:close', {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-destructive/80 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <AlertDialog
        open={pendingCloseId !== null}
        onOpenChange={(v) => {
          if (!v) setPendingCloseId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This plan tab has unsaved edits. Closing it will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCloseId) closeTab(pendingCloseId)
                setPendingCloseId(null)
              }}
            >
              Discard & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function BoardModeChevron(): JSX.Element | null {
  const workspaceId = useWorkspaces((s) => s.activeId)
  const mode = useBoardUi((s) =>
    resolveBoardMode(workspaceId ? s.modeByWorkspace[workspaceId] : undefined),
  )
  const setMode = useBoardUi((s) => s.setMode)
  if (!workspaceId) return null

  function pick(next: BoardMode): void {
    if (!workspaceId) return
    setMode(workspaceId, next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Switch board mode"
        >
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuItem onClick={() => pick('sessions')}>
          <LayoutGrid />
          Sessions {mode === 'sessions' ? '•' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick('graph')}>
          <Network />
          Dependency Graph {mode === 'graph' ? '•' : ''}
        </DropdownMenuItem>
        {import.meta.env.DEV ? (
          <DropdownMenuItem onClick={() => pick('sandbox')}>
            <FlaskConical />
            Dev Sandbox {mode === 'sandbox' ? '•' : ''}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
