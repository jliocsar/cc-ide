import { validateTmuxWindowName } from '@shared/tmux-name'
import { Maximize2, X } from 'lucide-react'
import { memo, type ReactNode, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import claudeSymbolUrl from '@/assets/claude-symbol.svg'
import { InlineRenameInput } from '@/components/ui/inline-rename-input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useCanvas } from '@/state/canvas'
import { useSessions } from '@/state/sessions'

type Props = {
  id: string
  title: string
  tmuxWindow?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  onMaximize?: () => void
  onClose?: () => void
  children: ReactNode
  badge?: ReactNode
  // Optional replacement for the default Claude logo (used by teammates to
  // show a colored dot, by subagents to show a cogs icon, etc.).
  leadingIcon?: ReactNode
  // Optional suffix after the title — e.g. "(teammate)".
  titleSuffix?: ReactNode
}

const MIN_W = 320
const MIN_H = 180

function WindowFrameImpl({
  id,
  title,
  tmuxWindow,
  x,
  y,
  width,
  height,
  zIndex,
  onMaximize,
  onClose,
  children,
  badge,
  leadingIcon,
  titleSuffix,
}: Props): JSX.Element {
  const updateWindow = useCanvas((s) => s.updateWindow)
  const focusWindow = useCanvas((s) => s.focusWindow)
  const [editing, setEditing] = useState(false)

  // Refs mirror live geometry so drag/resize handlers don't recreate per frame.
  const xRef = useRef(x)
  xRef.current = x
  const yRef = useRef(y)
  yRef.current = y
  const widthRef = useRef(width)
  widthRef.current = width
  const heightRef = useRef(height)
  heightRef.current = height
  const editingRef = useRef(editing)
  editingRef.current = editing

  const onTitlebarPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0) return
      if (ev.ctrlKey || ev.metaKey) return
      if (editingRef.current) return
      // Drag must not move windows in paged mode — the canvas is a scroller
      // there and individual window position is meaningless.
      if (ev.currentTarget.closest('[data-paged="true"]')) return
      if (ev.target instanceof Element && ev.target.closest('button, input, [data-rename-target]'))
        return
      ev.stopPropagation()
      focusWindow(id)
      const startX = ev.clientX
      const startY = ev.clientY
      const origX = xRef.current
      const origY = yRef.current
      const zoom = useCanvas.getState().camera.zoom
      const target = ev.currentTarget
      target.setPointerCapture(ev.pointerId)

      const move = (e: PointerEvent) => {
        const dx = (e.clientX - startX) / zoom
        const dy = (e.clientY - startY) / zoom
        updateWindow(id, { x: origX + dx, y: origY + dy })
      }
      const up = (e: PointerEvent) => {
        target.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [id, updateWindow, focusWindow],
  )

  const onTitlebarDoubleClick = useCallback(
    (ev: React.MouseEvent) => {
      if (ev.target instanceof Element && ev.target.closest('button, input, [data-rename-target]'))
        return
      onMaximize?.()
    },
    [onMaximize],
  )

  const onResizePointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      focusWindow(id)
      const startX = ev.clientX
      const startY = ev.clientY
      const origW = widthRef.current
      const origH = heightRef.current
      const zoom = useCanvas.getState().camera.zoom
      const target = ev.currentTarget
      target.setPointerCapture(ev.pointerId)

      const move = (e: PointerEvent) => {
        const dw = (e.clientX - startX) / zoom
        const dh = (e.clientY - startY) / zoom
        updateWindow(id, {
          width: Math.max(MIN_W, origW + dw),
          height: Math.max(MIN_H, origH + dh),
        })
      }
      const up = (e: PointerEvent) => {
        target.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [id, updateWindow, focusWindow],
  )

  const shortName = tmuxWindow ? tmuxWindow.split(':').slice(1).join(':') || tmuxWindow : null
  const displayTitle =
    shortName ?? (title.includes(':') ? title.split(':').slice(1).join(':') || title : title)

  return (
    <div
      data-window-id={id}
      onPointerDown={(e) => {
        if (e.ctrlKey || e.metaKey) return
        e.stopPropagation()
        focusWindow(id)
      }}
      className={cn(
        'cc-window-frame',
        'absolute flex flex-col overflow-hidden rounded-md border border-border bg-[#0a0a0a] shadow-2xl',
      )}
      // CSS in paged mode overrides position/size; `order` controls page
      // sequence inside the flex scroller (sorted by canvas-x). Setting it
      // unconditionally costs nothing outside paged mode.
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex,
        order: Math.round(x),
      }}
    >
      <div
        onPointerDown={onTitlebarPointerDown}
        onDoubleClick={onTitlebarDoubleClick}
        className="cc-window-chrome flex h-7 shrink-0 cursor-grab select-none items-center gap-2 border-b border-border bg-card px-3 text-[11px] font-mono text-muted-foreground active:cursor-grabbing"
      >
        {leadingIcon ?? <img src={claudeSymbolUrl} alt="" className="size-3.5 shrink-0" />}
        {editing && tmuxWindow && shortName !== null ? (
          <InlineRenameInput
            className="flex-1"
            value={shortName}
            validate={validateTmuxWindowName}
            onCancel={() => setEditing(false)}
            onCommit={async (next) => {
              try {
                await useSessions.getState().rename(tmuxWindow, next)
                setEditing(false)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err))
              }
            }}
          />
        ) : (
          <span
            data-rename-target={tmuxWindow ? '' : undefined}
            className={cn('truncate', tmuxWindow && 'cursor-text')}
            onDoubleClick={(e) => {
              if (!tmuxWindow) return
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {displayTitle}
          </span>
        )}
        {titleSuffix}
        {badge}
        <div className="ml-auto flex items-center gap-1">
          {onMaximize ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMaximize()
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-[color,background-color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
                  aria-label="Maximize window"
                >
                  <Maximize2 className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Maximize · Ctrl+Shift+F</TooltipContent>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-[color,background-color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
                  aria-label="Close window"
                >
                  <X className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close window</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">{children}</div>

      <div
        onPointerDown={onResizePointerDown}
        className="cc-window-chrome cc-resize-handle absolute bottom-0 right-0 size-3 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, var(--muted-foreground) 50%, var(--muted-foreground) 60%, transparent 60%, transparent 70%, var(--muted-foreground) 70%, var(--muted-foreground) 80%, transparent 80%)',
        }}
      />
    </div>
  )
}

export const WindowFrame = memo(WindowFrameImpl)
