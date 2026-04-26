import { Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCommentPulse } from '@/state/comment-pulse'
import { EMPTY_RANGES, type RangeDraft, useReviewComments } from '@/state/review-comments'

type BubbleProps = {
  tabId: string
  range: RangeDraft
}

/**
 * Inline comment bubble — anchored under the last line of a range.
 * Always-blue surface so the comment reads as meta on top of the content.
 */
export function CommentBubble({ tabId, range }: BubbleProps): JSX.Element {
  const pulse = useCommentPulse((s) => s.byTab[tabId] === range.id)
  const setComment = useReviewComments((s) => s.setComment)
  const removeRange = useReviewComments((s) => s.removeRange)
  const [editing, setEditing] = useState(() => range.comment.length === 0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Autofocus on first mount only when the range was just created (empty).
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount effect
  useEffect(() => {
    if (editing && range.comment.length === 0) {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  }, [])

  // Auto-grow textarea to content (capped via max-h CSS).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [range.comment])

  function handleBlur(): void {
    useCommentPulse.getState().setFocused(tabId, null)
    if (range.comment.trim().length === 0) {
      removeRange(tabId, range.id)
      return
    }
    setEditing(false)
  }

  function handleFocus(): void {
    useCommentPulse.getState().setFocused(tabId, range.id)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (range.comment.trim().length === 0) {
        removeRange(tabId, range.id)
      } else {
        textareaRef.current?.blur()
      }
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      textareaRef.current?.blur()
    }
  }

  function startEditing(): void {
    setEditing(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <div
      data-comment-bubble=""
      data-range-id={range.id}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'group/bubble relative my-1 ml-12 mr-4 rounded-md border-l-2 border-l-blue-500/60 bg-blue-500/10 p-2',
        pulse && 'ring-1 ring-blue-500/60 transition-shadow duration-300',
      )}
    >
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-blue-300/80">
        <span>
          comment · L{range.start}
          {range.len > 1 ? `–${range.start + range.len - 1}` : ''}
        </span>
        {range.comment.trim().length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label="Remove comment"
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/40 hover:text-foreground group-hover/bubble:opacity-100"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <Textarea
          ref={textareaRef}
          value={range.comment}
          onChange={(e) => setComment(tabId, range.id, e.target.value)}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKey}
          placeholder="What should change here?"
          rows={2}
          className="max-h-64 min-h-[3rem] w-full resize-none border border-blue-500/30 bg-background/40 font-mono text-[12px] focus-visible:ring-1 focus-visible:ring-blue-500/40"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="block w-full cursor-text whitespace-pre-wrap break-words text-left font-mono text-[12px] leading-[1.5] text-foreground"
        >
          {range.comment}
        </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment text will be lost. The selection range it anchors to will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeRange(tabId, range.id)
                setConfirmOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Store-connected variant: looks up its range by id and re-renders on changes.
 * Used by the CodeMirror widget where the parent React tree can't pass props.
 */
export function CommentBubbleById({
  tabId,
  rangeId,
}: {
  tabId: string
  rangeId: string
}): JSX.Element | null {
  const range = useReviewComments(
    (s) => (s.byTab[tabId] ?? EMPTY_RANGES).find((r) => r.id === rangeId) ?? null,
  )
  if (!range) return null
  return <CommentBubble tabId={tabId} range={range} />
}

type SidebarEntryProps = {
  tabId: string
  range: RangeDraft
  onJump: () => void
}

/**
 * Read-only sidebar entry. Click anywhere on the card → jump to anchor.
 * Hover-revealed remove button → confirm-and-remove.
 */
export function CommentSidebarEntry({ tabId, range, onJump }: SidebarEntryProps): JSX.Element {
  const removeRange = useReviewComments((s) => s.removeRange)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const text = range.comment.trim()

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onJump()
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onJump}
        onKeyDown={handleKeyDown}
        className="group relative flex w-full cursor-pointer flex-col gap-1 rounded-md border-l-2 border-l-blue-500/60 bg-blue-500/10 p-2 text-left hover:bg-blue-500/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/40"
      >
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-blue-300/80">
          <span>
            L{range.start}
            {range.len > 1 ? `–${range.start + range.len - 1}` : ''}
          </span>
          <button
            type="button"
            aria-label="Remove comment"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmOpen(true)
            }}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/40 hover:text-foreground group-hover:opacity-100"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
        {text ? (
          <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5] text-foreground">
            {text}
          </div>
        ) : (
          <div className="font-mono text-[11px] italic text-muted-foreground">empty…</div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment text will be lost. The selection range it anchors to will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeRange(tabId, range.id)
                setConfirmOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
