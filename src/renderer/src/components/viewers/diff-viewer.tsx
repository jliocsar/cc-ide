import { useEffect, useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, MessageSquarePlus } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { EMPTY_RANGES, diffTabId, useReviewComments, type RangeDraft } from '@/state/review-comments'
import type { FileDiffDTO, DiffHunkDTO, DiffHunkLineDTO } from '@shared/ipc'

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

  return (
    <div className="grid h-full grid-cols-[1fr_360px] bg-background">
      <DiffHunks tabId={tabId} hunks={diff.hunks} />
      <CommentsPanel tabId={tabId} workspaceId={workspaceId} />
    </div>
  )
}

function DiffHunks({ tabId, hunks }: { tabId: string; hunks: DiffHunkDTO[] }): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
  const startSingle = useReviewComments((s) => s.startSingle)
  const extendLast = useReviewComments((s) => s.extendLast)
  const setLast = useReviewComments((s) => s.setLast)

  function onClickNewLine(ev: React.MouseEvent, lineNo: number) {
    if (ev.shiftKey) {
      extendLast(tabId, lineNo)
      return
    }
    if (ev.metaKey || ev.ctrlKey) {
      startSingle(tabId, lineNo)
      return
    }
    const existing = ranges.find((r) => lineNo >= r.start && lineNo <= r.start + r.len - 1)
    if (existing) {
      setLast(tabId, existing.id)
      return
    }
    startSingle(tabId, lineNo)
  }

  function isCommented(lineNo: number): boolean {
    return ranges.some(
      (r) => lineNo >= r.start && lineNo <= r.start + r.len - 1 && r.comment.trim().length > 0,
    )
  }

  function isInRange(lineNo: number): boolean {
    return ranges.some((r) => lineNo >= r.start && lineNo <= r.start + r.len - 1)
  }

  return (
    <ScrollArea className="h-full border-r border-border">
      <div className="font-mono text-[12px]">
        {hunks.map((hunk, i) => (
          <div key={i} className="border-b border-border last:border-b-0">
            <div className="bg-card px-3 py-1 text-[11px] text-muted-foreground">
              {hunk.header}
            </div>
            <div className="grid grid-cols-2">
              <div className="border-r border-border">
                {hunk.lines.map((line, j) => (
                  <DiffHalfLine key={`o-${j}`} side="old" line={line} />
                ))}
              </div>
              <div>
                {hunk.lines.map((line, j) => (
                  <DiffHalfLine
                    key={`n-${j}`}
                    side="new"
                    line={line}
                    selectable={line.newLineNo !== null}
                    selected={line.newLineNo !== null && isInRange(line.newLineNo)}
                    commented={line.newLineNo !== null && isCommented(line.newLineNo)}
                    onClick={(e) => {
                      if (line.newLineNo === null) return
                      onClickNewLine(e, line.newLineNo)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function DiffHalfLine({
  side,
  line,
  selectable,
  selected,
  commented,
  onClick,
}: {
  side: 'old' | 'new'
  line: DiffHunkLineDTO
  selectable?: boolean
  selected?: boolean
  commented?: boolean
  onClick?: (e: React.MouseEvent) => void
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

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-2 px-2 leading-[1.6]',
        bg,
        selectable && 'cursor-pointer hover:bg-accent/30',
        selected && 'bg-accent/40',
        commented && 'border-l-2 border-l-primary bg-primary/10',
      )}
    >
      <span className="w-8 shrink-0 select-none text-right text-muted-foreground">{num ?? ''}</span>
      <span className="w-3 shrink-0 select-none text-muted-foreground">{display === null ? '' : sigil}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {display === null ? ' ' : display || ' '}
      </span>
    </div>
  )
}

function CommentsPanel({ tabId, workspaceId: _ }: { tabId: string; workspaceId: string }): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
  const setComment = useReviewComments((s) => s.setComment)
  const removeRange = useReviewComments((s) => s.removeRange)

  const sorted = useMemo(() => [...ranges].sort((a, b) => a.start - b.start), [ranges])

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <MessageSquarePlus className="size-3.5" />
        <span>Diff comments</span>
        <span className="ml-auto font-mono lowercase">{ranges.length} range{ranges.length === 1 ? '' : 's'}</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {sorted.length === 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              click a line on the right (new) side to comment.
              <br />
              shift extends · ctrl/cmd adds disjoint.
            </div>
          ) : (
            sorted.map((r: RangeDraft) => (
              <div
                key={r.id}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>@@ {r.start},{r.len} @@</span>
                  <Button size="icon-xs" variant="ghost" onClick={() => removeRange(tabId, r.id)} aria-label="Cancel">
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
