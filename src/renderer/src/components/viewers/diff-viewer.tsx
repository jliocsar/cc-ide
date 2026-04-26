import type { DiffHunkDTO, DiffHunkLineDTO, FileDiffDTO } from '@shared/ipc'
import { ChevronLeft, ChevronRight, Link2, Link2Off, MessageSquarePlus } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThemedToken } from 'shiki'
import { toast } from 'sonner'
import { CommentBubble, CommentSidebarEntry } from '@/components/review/comment-surfaces'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VerticalResizer } from '@/components/vertical-resizer'
import { invoke } from '@/lib/ipc'
import { guessLang, tokenizeLines } from '@/lib/shiki'
import { resolveFontFamily } from '@/lib/system-fonts'
import { cn } from '@/lib/utils'
import { useCommentPulse } from '@/state/comment-pulse'
import {
  diffTabId,
  EMPTY_RANGES,
  type RangeDraft,
  useReviewComments,
} from '@/state/review-comments'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'

type HunkTokens = {
  oldTokens: ThemedToken[][]
  newTokens: ThemedToken[][]
  oldLineIdx: number[] // hunkLineIdx → index into oldTokens, or -1
  newLineIdx: number[] // hunkLineIdx → index into newTokens, or -1
}

function buildSideTexts(hunk: DiffHunkDTO): {
  oldText: string
  newText: string
  oldLineIdx: number[]
  newLineIdx: number[]
} {
  const oldLines: string[] = []
  const newLines: string[] = []
  const oldLineIdx: number[] = []
  const newLineIdx: number[] = []
  for (const line of hunk.lines) {
    if (line.kind === 'add') {
      oldLineIdx.push(-1)
      newLineIdx.push(newLines.length)
      newLines.push(line.content)
    } else if (line.kind === 'remove') {
      oldLineIdx.push(oldLines.length)
      newLineIdx.push(-1)
      oldLines.push(line.content)
    } else {
      oldLineIdx.push(oldLines.length)
      newLineIdx.push(newLines.length)
      oldLines.push(line.content)
      newLines.push(line.content)
    }
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n'), oldLineIdx, newLineIdx }
}

export function DiffViewer({
  workspaceId,
  worktreePath,
  path,
  stage,
}: {
  workspaceId: string
  worktreePath: string
  path: string
  stage: 'staged' | 'unstaged'
}): JSX.Element {
  const tabId = diffTabId(worktreePath, path, stage)
  const [diff, setDiff] = useState<FileDiffDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commentsCollapsed, setCommentsCollapsed] = useState(false)
  const reviewPanelWidth = useUi((s) => s.reviewPanelWidth)
  const setReviewPanelWidth = useUi((s) => s.setReviewPanelWidth)
  const resetReviewPanelWidth = useUi((s) => s.resetReviewPanelWidth)
  const [resizing, setResizing] = useState(false)
  const diffSideRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { diff } = await invoke('diffs:get', { worktreePath, path, stage })
        if (!cancelled) setDiff(diff)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [worktreePath, path, stage])

  const requestJump = useCallback(
    (rangeId: string, lastLine: number) => {
      const root = diffSideRef.current
      if (!root) return
      const el = root.querySelector<HTMLElement>(`[data-diff-line-no="${lastLine}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      useCommentPulse.getState().pulse(tabId, rangeId)
    },
    [tabId],
  )

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-destructive">
        {error}
      </div>
    )
  }
  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-muted-foreground">
        loading…
      </div>
    )
  }
  if (diff.binary) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-muted-foreground">
        binary file · cannot diff
      </div>
    )
  }
  if (diff.tooLarge) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-muted-foreground">
        diff exceeds size guard (&gt; 20k lines)
      </div>
    )
  }
  if (diff.hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-2 rounded-md border border-border bg-card px-6 py-5 text-center font-mono text-[12px] text-muted-foreground">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            no diff
          </span>
          <span className="text-foreground">file is no longer in this diff</span>
          <span className="text-[11px] text-muted-foreground/80">
            it was likely committed, reverted, or restaged. close this tab to dismiss.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid h-full grid-rows-[minmax(0,1fr)] bg-background',
        resizing ? 'transition-none' : 'transition-[grid-template-columns] duration-150',
      )}
      style={{
        gridTemplateColumns: commentsCollapsed
          ? 'minmax(0,1fr) 0px 32px'
          : `minmax(0,1fr) 1px ${reviewPanelWidth}px`,
      }}
    >
      <div ref={diffSideRef} className="h-full min-h-0 overflow-hidden">
        <DiffHunks tabId={tabId} hunks={diff.hunks} path={path} />
      </div>
      {commentsCollapsed ? (
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
        {commentsCollapsed ? (
          <CommentsRail tabId={tabId} onExpand={() => setCommentsCollapsed(false)} />
        ) : (
          <div style={{ width: reviewPanelWidth, height: '100%' }}>
            <CommentsPanel
              tabId={tabId}
              workspaceId={workspaceId}
              onCollapse={() => setCommentsCollapsed(true)}
              onJump={requestJump}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function useHunkTokens(hunks: DiffHunkDTO[], path: string): (HunkTokens | null)[] {
  const [tokens, setTokens] = useState<(HunkTokens | null)[]>(() => hunks.map(() => null))

  useEffect(() => {
    let cancelled = false
    const lang = guessLang(path)
    setTokens(hunks.map(() => null))
    void (async () => {
      const built = hunks.map((h) => buildSideTexts(h))
      const results = await Promise.all(
        built.map(async (b) => {
          const [oldTokens, newTokens] = await Promise.all([
            tokenizeLines(b.oldText, lang),
            tokenizeLines(b.newText, lang),
          ])
          return { oldTokens, newTokens, oldLineIdx: b.oldLineIdx, newLineIdx: b.newLineIdx }
        }),
      )
      if (!cancelled) setTokens(results)
    })()
    return () => {
      cancelled = true
    }
  }, [hunks, path])

  return tokens
}

function lineNoUnderPoint(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  const row = (el as HTMLElement).closest<HTMLElement>('[data-diff-row]')
  if (!row) return null
  if (row.dataset.diffLineNo) return Number(row.dataset.diffLineNo)
  let prev = row.previousElementSibling as HTMLElement | null
  while (prev) {
    if (prev.dataset?.diffLineNo) return Number(prev.dataset.diffLineNo)
    prev = prev.previousElementSibling as HTMLElement | null
  }
  return null
}

function DiffHunks({
  tabId,
  hunks,
  path,
}: {
  tabId: string
  hunks: DiffHunkDTO[]
  path: string
}): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
  const startSingle = useReviewComments((s) => s.startSingle)
  const attemptToggle = useReviewComments((s) => s.attemptToggle)
  const removeRange = useReviewComments((s) => s.removeRange)
  const extendLast = useReviewComments((s) => s.extendLast)
  const hunkTokens = useHunkTokens(hunks, path)
  const draggingRef = useRef(false)
  const lastLineRef = useRef<number | null>(null)

  const diffFont = useSettings((s) => s.settings.diff.font)
  const diffFontSize = useSettings((s) => s.settings.diff.fontSize)
  const diffWrap = useSettings((s) => s.settings.diff.wrap)
  const diffStickyGutter = useSettings((s) => s.settings.diff.stickyGutter)
  const [syncScroll, setSyncScroll] = useState(true)
  const [oldPaneWidthPct, setOldPaneWidthPct] = useState(50)
  const resizingRef = useRef(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const oldPaneRef = useRef<HTMLDivElement>(null)
  const newPaneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMove(ev: PointerEvent): void {
      if (!resizingRef.current) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setOldPaneWidthPct(Math.max(20, Math.min(80, pct)))
    }
    function onUp(): void {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  function onResizerPointerDown(ev: React.PointerEvent): void {
    if (ev.button !== 0) return
    ev.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // After-pane drives before-pane vertical sync
  useEffect(() => {
    const newEl = newPaneRef.current
    const oldEl = oldPaneRef.current
    if (!newEl || !oldEl || !syncScroll) return
    oldEl.scrollTop = newEl.scrollTop
    function onScroll(): void {
      oldEl!.scrollTop = newEl!.scrollTop
    }
    newEl.addEventListener('scroll', onScroll, { passive: true })
    return () => newEl.removeEventListener('scroll', onScroll)
  }, [syncScroll])

  const fontStyle: React.CSSProperties = {
    fontFamily: resolveFontFamily(diffFont, null, 'mono'),
    fontSize: `${diffFontSize}px`,
  }

  const focusedRangeId = useCommentPulse((s) => s.focusedByTab[tabId] ?? null)

  function isInRange(lineNo: number): boolean {
    return ranges.some((r) => lineNo >= r.start && lineNo <= r.start + r.len - 1)
  }

  // Q14b: a line is "active" (strong blue) only while its range is being
  // edited or still empty. Once committed (non-empty + blurred), the line
  // returns to intrinsic bg and the bubble alone carries the signal.
  function isActive(lineNo: number): boolean {
    return ranges.some((r) => {
      if (lineNo < r.start || lineNo > r.start + r.len - 1) return false
      const empty = r.comment.trim().length === 0
      return empty || r.id === focusedRangeId
    })
  }

  // Map: new-line-no → range whose end is that line (for inline bubble placement)
  const bubbleByEndLine = useMemo(() => {
    const m = new Map<number, RangeDraft>()
    for (const r of ranges) m.set(r.start + r.len - 1, r)
    return m
  }, [ranges])

  function handleRemoveCommented(rangeId: string): void {
    removeRange(tabId, rangeId)
    toast.dismiss()
  }

  useEffect(() => {
    function onMove(ev: PointerEvent): void {
      if (!draggingRef.current) return
      const n = lineNoUnderPoint(ev.clientX, ev.clientY)
      if (n === null || n === lastLineRef.current) return
      lastLineRef.current = n
      extendLast(tabId, n)
    }
    function onUp(): void {
      draggingRef.current = false
      lastLineRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  function onNewSidePointerDown(ev: React.PointerEvent): void {
    if (ev.button !== 0) return
    if (!(ev.metaKey || ev.ctrlKey)) return
    // Inline bubble swallows its own clicks via stopPropagation; this guard
    // also keeps Ctrl-click from hijacking selection inside the textarea.
    if ((ev.target as HTMLElement).closest('[data-comment-bubble]')) return
    const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-diff-line-no]')
    if (!row) return
    const lineNo = Number(row.dataset.diffLineNo)
    if (isInRange(lineNo)) {
      const result = attemptToggle(tabId, lineNo)
      if (!result.ok && 'blockedRangeId' in result) {
        const blockedId = result.blockedRangeId
        toast.message('Range has a comment', {
          description: 'Remove it first to edit the selection.',
          action: { label: 'Remove comment', onClick: () => handleRemoveCommented(blockedId) },
          duration: 6000,
        })
      }
    } else {
      startSingle(tabId, lineNo)
      draggingRef.current = true
    }
    ev.preventDefault()
  }

  return (
    <div ref={containerRef} className="relative flex h-full overflow-hidden border-r border-border">
      {/* Old pane */}
      <div
        ref={oldPaneRef}
        className={cn(
          'scrollbar-themed shrink-0 overflow-x-auto border-r border-border',
          syncScroll ? 'overflow-y-hidden' : 'overflow-y-auto',
        )}
        style={{ ...fontStyle, width: `${oldPaneWidthPct}%` }}
      >
        <div className={cn(diffWrap ? 'w-full' : 'w-max min-w-full')}>
          {hunks.map((hunk, i) => (
            <div key={i} className="border-b border-border last:border-b-0">
              <div className="sticky top-0 z-20 bg-card px-3 py-1 text-[11px] text-muted-foreground">
                <span className="sticky left-3 inline-block">{hunk.header}</span>
              </div>
              {hunk.lines.map((line, j) => {
                const ht = hunkTokens[i]
                const idx = ht ? (ht.oldLineIdx[j] ?? -1) : -1
                const tokens = ht && idx >= 0 ? (ht.oldTokens[idx] ?? null) : null
                return (
                  <DiffHalfLine
                    key={`o-${j}`}
                    side="old"
                    line={line}
                    tokens={tokens}
                    wrap={diffWrap}
                    stickyGutter={diffStickyGutter}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Resizer */}
      <div
        onPointerDown={onResizerPointerDown}
        onDoubleClick={() => setOldPaneWidthPct(50)}
        className="relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/40"
      />

      {/* New pane */}
      <div
        ref={newPaneRef}
        className="scrollbar-themed min-w-0 flex-1 overflow-auto"
        style={fontStyle}
        onPointerDown={onNewSidePointerDown}
      >
        <div className={cn(diffWrap ? 'w-full' : 'w-max min-w-full')}>
          {hunks.map((hunk, i) => (
            <div key={i} className="border-b border-border last:border-b-0">
              <div className="sticky top-0 z-20 bg-card px-3 py-1 text-[11px] text-muted-foreground">
                <span className="sticky left-3 inline-block">{hunk.header}</span>
              </div>
              {hunk.lines.map((line, j) => {
                const ht = hunkTokens[i]
                const idx = ht ? (ht.newLineIdx[j] ?? -1) : -1
                const tokens = ht && idx >= 0 ? (ht.newTokens[idx] ?? null) : null
                const lineNo = line.newLineNo
                const bubble = lineNo != null ? bubbleByEndLine.get(lineNo) : undefined
                return (
                  <div key={`n-${j}`}>
                    <DiffHalfLine
                      side="new"
                      line={line}
                      tokens={tokens}
                      wrap={diffWrap}
                      stickyGutter={diffStickyGutter}
                      selectable={line.newLineNo !== null}
                      selected={line.newLineNo !== null && isActive(line.newLineNo)}
                      inRange={line.newLineNo !== null && isInRange(line.newLineNo)}
                    />
                    {bubble ? <CommentBubble tabId={tabId} range={bubble} /> : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Sync scroll toggle */}
      <div className="absolute right-3 top-1 z-30 rounded-md border border-border bg-card/90 shadow-sm backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant="ghost" onClick={() => setSyncScroll((v) => !v)}>
              {syncScroll ? <Link2 /> : <Link2Off />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {syncScroll ? 'Unsync scroll' : 'Sync scroll'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

const DiffHalfLine = memo(function DiffHalfLine({
  side,
  line,
  tokens,
  wrap,
  stickyGutter,
  selectable,
  selected,
  inRange,
}: {
  side: 'old' | 'new'
  line: DiffHunkLineDTO
  tokens: ThemedToken[] | null
  wrap: boolean
  stickyGutter: boolean
  selectable?: boolean
  selected?: boolean
  inRange?: boolean
}): JSX.Element {
  const num = side === 'old' ? line.oldLineNo : line.newLineNo
  const display =
    side === 'old' && line.kind === 'add'
      ? null
      : side === 'new' && line.kind === 'remove'
        ? null
        : line.content
  const bg =
    line.kind === 'add' && side === 'new'
      ? 'bg-green-500/10'
      : line.kind === 'remove' && side === 'old'
        ? 'bg-red-500/10'
        : ''
  const sigil = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '

  const gutterBg = stickyGutter
    ? selected
      ? 'color-mix(in srgb, #3b82f6 15%, var(--background))'
      : line.kind === 'add' && side === 'new'
        ? 'color-mix(in srgb, #22c55e 10%, var(--background))'
        : line.kind === 'remove' && side === 'old'
          ? 'color-mix(in srgb, #ef4444 10%, var(--background))'
          : 'var(--background)'
    : undefined

  return (
    <div
      data-diff-row={side === 'new' ? '' : undefined}
      data-diff-line-no={side === 'new' && num !== null ? num : undefined}
      className={cn(
        'group flex items-start gap-2 border-l-2 px-2 leading-[1.6]',
        bg,
        selectable && 'cursor-pointer hover:shadow-[inset_0_0_0_9999px_rgba(255,255,255,0.08)]',
        selected
          ? 'border-l-blue-500 bg-blue-500/15'
          : inRange
            ? 'border-l-blue-500/40'
            : 'border-l-transparent',
      )}
    >
      {stickyGutter ? (
        <div
          className={cn(
            'flex shrink-0 gap-2 shadow-[1px_0_0_var(--border)]',
            'group-hover:shadow-[inset_0_0_0_9999px_rgba(255,255,255,0.08),1px_0_0_var(--border)]',
          )}
          style={{
            position: 'sticky',
            left: 0,
            zIndex: 10,
            backgroundColor: gutterBg,
          }}
        >
          <span className="w-8 select-none text-right text-muted-foreground">{num ?? ''}</span>
          <span className="w-3 select-none text-muted-foreground">
            {display === null ? '' : sigil}
          </span>
        </div>
      ) : (
        <>
          <span className="w-8 shrink-0 select-none text-right text-muted-foreground">
            {num ?? ''}
          </span>
          <span className="w-3 shrink-0 select-none text-muted-foreground">
            {display === null ? '' : sigil}
          </span>
        </>
      )}
      <span
        className={cn(
          'min-w-0 flex-1',
          wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
        )}
      >
        {display === null
          ? ' '
          : tokens && tokens.length > 0
            ? tokens.map((t, k) => (
                <span key={k} style={t.color ? { color: t.color } : undefined}>
                  {t.content}
                </span>
              ))
            : display || ' '}
      </span>
    </div>
  )
})

function CommentsPanel({
  tabId,
  workspaceId: _,
  onCollapse,
  onJump,
}: {
  tabId: string
  workspaceId: string
  onCollapse: () => void
  onJump: (rangeId: string, lastLine: number) => void
}): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
  const sorted = useMemo(() => [...ranges].sort((a, b) => a.start - b.start), [ranges])

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border pl-2 pr-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCollapse}
              aria-label="Collapse diff comments"
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
        <MessageSquarePlus className="size-3.5" />
        <span>Diff comments</span>
        <span className="ml-auto font-mono lowercase">
          {ranges.length} range{ranges.length === 1 ? '' : 's'}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {sorted.length === 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              ctrl/cmd-click a line on the right (new) side to comment.
              <br />
              ctrl/cmd-click and drag to select multiple lines.
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
            aria-label="Expand diff comments"
          >
            <ChevronLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Expand diff comments</TooltipContent>
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
