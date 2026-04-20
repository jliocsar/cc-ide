import { ChevronLeft, ChevronRight, Eye, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MarkdownFileEditor } from '@/components/editor/markdown-file-editor'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VerticalResizer } from '@/components/vertical-resizer'
import { friendlyFsError } from '@/lib/fs-errors'
import { invoke, invoke as invokeIpc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { type PlanMode, usePlanTabUi } from '@/state/plan-tab-ui'
import {
  EMPTY_RANGES,
  planTabId,
  type RangeDraft,
  useReviewComments,
} from '@/state/review-comments'
import { useUi } from '@/state/ui'

export function PlanViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string
  relPath: string
}): JSX.Element {
  const tabId = planTabId(workspaceId, relPath)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mode = usePlanTabUi((s) => s.byTab[tabId]?.mode ?? 'review')
  const setMode = usePlanTabUi((s) => s.setMode)
  const toggleMode = usePlanTabUi((s) => s.toggleMode)
  const sidebarCollapsed = usePlanTabUi((s) => s.byTab[tabId]?.sidebarCollapsed ?? false)
  const reviewPanelWidth = useUi((s) => s.reviewPanelWidth)
  const setReviewPanelWidth = useUi((s) => s.setReviewPanelWidth)
  const resetReviewPanelWidth = useUi((s) => s.resetReviewPanelWidth)
  const [resizing, setResizing] = useState(false)
  const setSidebarCollapsed = usePlanTabUi((s) => s.setSidebarCollapsed)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { content } = await invoke('plans:read', { workspaceId, relPath })
        if (!cancelled) setContent(content)
      } catch (err) {
        if (!cancelled) setError(friendlyFsError(err, relPath))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, relPath])

  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod || !ev.shiftKey) return
      if (ev.key === 'm' || ev.key === 'M') {
        ev.preventDefault()
        toggleMode(tabId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabId, toggleMode])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-destructive">
        {error}
      </div>
    )
  }
  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-muted-foreground">
        loading…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 bg-background',
        resizing ? 'transition-none' : 'transition-[grid-template-columns] duration-150',
      )}
      style={{
        gridTemplateColumns: sidebarCollapsed
          ? 'minmax(0,1fr) 0px 32px'
          : `minmax(0,1fr) 1px ${reviewPanelWidth}px`,
      }}
    >
      <div className="h-full min-h-0 overflow-hidden border-r border-border">
        <MarkdownFileEditor
          tabId={tabId}
          initialContent={content}
          reviewCapable
          onSave={async (next) => {
            await invokeIpc('plans:write', { workspaceId, relPath, content: next })
          }}
        />
      </div>
      {sidebarCollapsed ? (
        <div />
      ) : (
        <VerticalResizer
          side="left"
          width={reviewPanelWidth}
          onWidth={setReviewPanelWidth}
          onReset={resetReviewPanelWidth}
          onResizeStart={() => setResizing(true)}
          onResizeEnd={() => setResizing(false)}
        />
      )}
      <div className="h-full min-h-0 overflow-hidden">
        {sidebarCollapsed ? (
          <CommentsRail tabId={tabId} onExpand={() => setSidebarCollapsed(tabId, false)} />
        ) : (
          <div style={{ width: reviewPanelWidth, height: '100%' }}>
            <CommentsPanel
              tabId={tabId}
              mode={mode}
              onSetMode={(m) => setMode(tabId, m)}
              onCollapse={() => setSidebarCollapsed(tabId, true)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function CommentsPanel({
  tabId,
  mode,
  onSetMode,
  onCollapse,
}: {
  tabId: string
  mode: PlanMode
  onSetMode: (m: PlanMode) => void
  onCollapse: () => void
}): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
  const setComment = useReviewComments((s) => s.setComment)
  const removeRange = useReviewComments((s) => s.removeRange)

  const sorted = useMemo(() => [...ranges].sort((a, b) => a.start - b.start), [ranges])

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 pr-3 text-[11px] text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCollapse}
              aria-label="Collapse review comments"
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
        <div className="flex items-center rounded-md border border-border bg-background p-[2px]">
          <button
            type="button"
            onClick={() => onSetMode('edit')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              mode === 'edit'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <Pencil className="size-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onSetMode('review')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              mode === 'review'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <Eye className="size-3" />
            Review
          </button>
        </div>
        <span className="ml-auto font-mono text-[10px] opacity-60">Ctrl+Shift+M</span>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <MessageSquarePlus className="size-3.5" />
        <span>Review comments</span>
        <span className="ml-auto font-mono lowercase">
          {ranges.length} range{ranges.length === 1 ? '' : 's'}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {sorted.length === 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              ctrl/cmd-click a line to start a comment.
              <br />
              ctrl/cmd-click and drag to select multiple lines.
              <br />
              drag the tab into a terminal to send.
            </div>
          ) : (
            sorted.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>
                    @@ {r.start}
                    {r.len > 1 ? `,${r.len}` : ',1'} @@
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeRange(tabId, r.id)}
                    aria-label="Cancel"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Textarea
                  value={r.comment}
                  onChange={(e) => setComment(tabId, r.id, e.target.value)}
                  placeholder="What should change here?"
                  rows={3}
                  className="resize-none font-mono text-[12px]"
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function CommentsRail({ tabId, onExpand }: { tabId: string; onExpand: () => void }): JSX.Element {
  const rangeCount = useReviewComments((s) => s.byTab[tabId]?.length ?? 0)

  return (
    <div className="flex h-full flex-col items-center gap-2 border-l border-border bg-card py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onExpand}
            aria-label="Expand review comments"
          >
            <ChevronLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Expand review comments</TooltipContent>
      </Tooltip>
      {rangeCount > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 font-mono text-[10px] text-foreground">
              {rangeCount}
            </span>
          </TooltipTrigger>
          <TooltipContent>{`${rangeCount} range${rangeCount === 1 ? '' : 's'}`}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
