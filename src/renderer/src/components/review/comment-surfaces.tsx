import { Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
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
import { microFade, springLayout } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useCommentPulse } from '@/state/comment-pulse'
import { EMPTY_RANGES, type RangeDraft, useReviewComments } from '@/state/review-comments'

function rangeLabel(range: RangeDraft): string {
  return range.len > 1 ? `L${range.start}–${range.start + range.len - 1}` : `L${range.start}`
}

type BubbleProps = {
  tabId: string
  range: RangeDraft
}

/**
 * Inline comment bubble — anchored under the last line of a range.
 * Sits as a quiet card on top of the content with a thin accent rule.
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
  })

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

  const hasComment = range.comment.trim().length > 0

  function handleRemove(): void {
    if (!hasComment) {
      removeRange(tabId, range.id)
    } else {
      setConfirmOpen(true)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -2, transition: microFade }}
      transition={springLayout}
      data-comment-bubble=""
      data-range-id={range.id}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'group/bubble relative my-1.5 ml-12 mr-4 overflow-hidden rounded-xl border bg-card/70 p-2.5 pl-3',
        'transition-[background-color,border-color,box-shadow] duration-200',
        pulse
          ? 'border-blue-400/45 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
          : 'border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.18)] hover:border-border',
        'before:pointer-events-none before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-r-full before:bg-blue-400/55',
      )}
    >
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {rangeLabel(range)}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleRemove}
          aria-label="Remove comment"
          className="relative -mr-1 flex size-6 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-[background-color,color,opacity] duration-150 after:absolute after:-inset-2 hover:bg-accent/55 hover:text-foreground group-hover/bubble:opacity-100"
        >
          <X className="size-3" />
        </button>
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
          className="max-h-64 min-h-[2.75rem] w-full resize-none rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-[13px] leading-[1.55] shadow-none transition-[background-color,border-color] placeholder:text-muted-foreground/55 focus-visible:border-blue-400/55 focus-visible:bg-background/60 focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="block min-h-7 w-full cursor-text whitespace-pre-wrap break-words text-pretty rounded-md px-1.5 py-1 text-left text-[13px] leading-[1.55] text-foreground transition-[background-color] hover:bg-background/30 focus-visible:bg-background/40 focus-visible:outline-none"
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
    </motion.div>
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
  const isEmpty = text.length === 0

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onJump()
    }
  }

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 6, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -2, transition: microFade }}
        transition={springLayout}
        whileTap={{ scale: 0.985 }}
        role="button"
        tabIndex={0}
        onClick={onJump}
        onKeyDown={handleKeyDown}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col gap-1.5 overflow-hidden rounded-xl border bg-card/70 p-2.5 pl-3 text-left',
          'transition-[background-color,border-color] duration-150 hover:bg-card hover:border-border',
          'focus-visible:outline-none focus-visible:border-blue-400/55',
          'before:pointer-events-none before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-r-full',
          isEmpty
            ? 'border-border/50 before:bg-amber-300/55'
            : 'border-border/60 before:bg-blue-400/55',
        )}
      >
        <div className="flex min-h-5 items-center justify-between gap-2">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {rangeLabel(range)}
          </span>
          <button
            type="button"
            aria-label="Remove comment"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (isEmpty) {
                removeRange(tabId, range.id)
              } else {
                setConfirmOpen(true)
              }
            }}
            className="relative -mr-1 flex size-6 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-[background-color,color,opacity] duration-150 after:absolute after:-inset-2 hover:bg-accent/55 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
        {!isEmpty ? (
          <div className="whitespace-pre-wrap break-words text-pretty text-[13px] leading-[1.55] text-foreground">
            {text}
          </div>
        ) : (
          <div className="text-[12px] italic text-muted-foreground/80">Draft — no comment yet</div>
        )}
      </motion.div>

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
