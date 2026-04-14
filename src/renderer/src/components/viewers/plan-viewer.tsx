import { useEffect, useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, MessageSquarePlus } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { planTabId, useReviewComments, type RangeDraft } from '@/state/review-comments'

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { content } = await invoke('plans:read', { workspaceId, relPath })
        if (!cancelled) setContent(content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, relPath])

  const lines = useMemo(() => (content ?? '').split('\n'), [content])

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
    <div className="grid h-full grid-cols-[1fr_360px] bg-background">
      <PlanLines tabId={tabId} lines={lines} />
      <CommentsPanel tabId={tabId} />
    </div>
  )
}

function PlanLines({ tabId, lines }: { tabId: string; lines: string[] }): JSX.Element {
  const startSingle = useReviewComments((s) => s.startSingle)
  const extendLast = useReviewComments((s) => s.extendLast)
  const setLast = useReviewComments((s) => s.setLast)
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? [])

  function onLineClick(ev: React.MouseEvent<HTMLDivElement>, lineNo: number) {
    const isShift = ev.shiftKey
    const isMeta = ev.metaKey || ev.ctrlKey
    if (isShift) {
      extendLast(tabId, lineNo)
      return
    }
    if (isMeta) {
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

  function rangeForLine(lineNo: number): RangeDraft | undefined {
    return ranges.find((r) => lineNo >= r.start && lineNo <= r.start + r.len - 1)
  }

  return (
    <ScrollArea className="h-full border-r border-border">
      <div className="select-text font-mono text-[12px] leading-[1.6]">
        {lines.map((line, i) => {
          const lineNo = i + 1
          const range = rangeForLine(lineNo)
          const inRange = !!range
          const hasComment = range?.comment.trim().length ?? 0
          return (
            <div
              key={lineNo}
              onClick={(e) => onLineClick(e, lineNo)}
              className={cn(
                'group flex cursor-pointer items-start gap-3 px-3 hover:bg-accent/30',
                inRange && 'bg-accent/40',
                hasComment && 'border-l-2 border-l-primary bg-primary/10',
              )}
            >
              <span className="w-10 shrink-0 select-none text-right text-muted-foreground">{lineNo}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line || ' '}</span>
            </div>
          )
        })}
        <div className="h-12" />
      </div>
    </ScrollArea>
  )
}

function CommentsPanel({ tabId }: { tabId: string }): JSX.Element {
  const ranges = useReviewComments((s) => s.byTab[tabId] ?? [])
  const setComment = useReviewComments((s) => s.setComment)
  const removeRange = useReviewComments((s) => s.removeRange)

  const sorted = useMemo(() => [...ranges].sort((a, b) => a.start - b.start), [ranges])

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <MessageSquarePlus className="size-3.5" />
        <span>Review comments</span>
        <span className="ml-auto font-mono lowercase">{ranges.length} range{ranges.length === 1 ? '' : 's'}</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {sorted.length === 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              click a line in the plan to start a comment.
              <br />
              shift-click extends · ctrl/cmd-click adds disjoint ranges.
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
