import { BookOpen, ChevronLeft, ChevronRight, MessageSquarePlus, Pencil } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MarkdownFileEditor,
  type MarkdownFileEditorHandle,
} from '@/components/editor/markdown-file-editor'
import { MarkdownPreview } from '@/components/preview/markdown-preview'
import { CommentSidebarEntry } from '@/components/review/comment-surfaces'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VerticalResizer } from '@/components/vertical-resizer'
import { friendlyFsError } from '@/lib/fs-errors'
import { invoke, invoke as invokeIpc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useCommentPulse } from '@/state/comment-pulse'
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
  const [previewSnapshot, setPreviewSnapshot] = useState<string>('')
  const editorHandleRef = useRef<MarkdownFileEditorHandle | null>(null)
  const mode = usePlanTabUi((s) => s.byTab[tabId]?.mode ?? 'edit')
  const setMode = usePlanTabUi((s) => s.setMode)
  const cycleMode = usePlanTabUi((s) => s.cycleMode)
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

  function snapshotForPreview(): void {
    const buf = editorHandleRef.current?.getBuffer() ?? content ?? ''
    setPreviewSnapshot(buf)
  }

  function handleSetMode(m: PlanMode): void {
    if (m === 'preview') snapshotForPreview()
    setMode(tabId, m)
  }

  function handleCycle(): void {
    const curr = usePlanTabUi.getState().byTab[tabId]?.mode ?? 'edit'
    if (curr === 'edit') snapshotForPreview()
    cycleMode(tabId)
  }

  const handleCycleRef = useRef(handleCycle)
  handleCycleRef.current = handleCycle

  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod || !ev.shiftKey) return
      if (ev.key === 'm' || ev.key === 'M') {
        ev.preventDefault()
        handleCycleRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const requestJump = useCallback(
    (rangeId: string, lastLine: number) => {
      // Auto-switch to Edit when navigating from sidebar in Preview mode (Q7).
      const currentMode = usePlanTabUi.getState().byTab[tabId]?.mode ?? 'edit'
      if (currentMode === 'preview') {
        setMode(tabId, 'edit')
      }
      // Defer to next frame so the editor has remounted before scrolling.
      requestAnimationFrame(() => {
        editorHandleRef.current?.scrollToLine(lastLine)
        useCommentPulse.getState().pulse(tabId, rangeId)
      })
    },
    [tabId, setMode],
  )

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
        {mode === 'preview' ? (
          <MarkdownPreview
            workspaceId={workspaceId}
            relPath={relPath}
            content={previewSnapshot || content}
          />
        ) : (
          <MarkdownFileEditor
            ref={editorHandleRef}
            tabId={tabId}
            initialContent={content}
            reviewCapable
            onSave={async (next) => {
              await invokeIpc('plans:write', { workspaceId, relPath, content: next })
            }}
          />
        )}
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
              onSetMode={handleSetMode}
              onCollapse={() => setSidebarCollapsed(tabId, true)}
              onJump={requestJump}
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
  onJump,
}: {
  tabId: string
  mode: PlanMode
  onSetMode: (m: PlanMode) => void
  onCollapse: () => void
  onJump: (rangeId: string, lastLine: number) => void
}): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]

  const sorted = useMemo(() => [...ranges].sort((a, b) => a.start - b.start), [ranges])
  const commentCount = ranges.filter((r) => r.comment.trim().length > 0).length

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
            onClick={() => onSetMode('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              mode === 'preview'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <BookOpen className="size-3" />
            Preview
          </button>
        </div>
        {commentCount > 0 ? (
          <span
            title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
            className="rounded-full border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] text-blue-300"
          >
            {commentCount}
          </span>
        ) : null}
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
        <div className="flex flex-col gap-2 p-3">
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
              <CommentSidebarEntry
                key={r.id}
                tabId={tabId}
                range={r}
                onJump={() => onJump(r.id, r.start + r.len - 1)}
              />
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
            <button
              type="button"
              onClick={onExpand}
              className="flex min-w-5 items-center justify-center rounded-full bg-blue-500/20 px-1.5 font-mono text-[10px] text-foreground hover:bg-blue-500/30"
            >
              {rangeCount}
            </button>
          </TooltipTrigger>
          <TooltipContent>{`${rangeCount} range${rangeCount === 1 ? '' : 's'}`}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
