import { validateTmuxWindowName } from '@shared/tmux-name'
import { Maximize2, X } from 'lucide-react'
import { memo, type ReactNode, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { InlineRenameInput } from '@/components/ui/inline-rename-input'
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
  maximized?: boolean
  onMaximize?: () => void
  onClose?: () => void
  children: ReactNode
  badge?: ReactNode
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
  maximized,
  onMaximize,
  onClose,
  children,
  badge,
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
  const maximizedRef = useRef(maximized)
  maximizedRef.current = maximized

  const onTitlebarPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0) return
      if (ev.ctrlKey || ev.metaKey) return
      if (maximizedRef.current) return
      if (editingRef.current) return
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
      onPointerDown={(e) => {
        if (e.ctrlKey || e.metaKey) return
        e.stopPropagation()
        focusWindow(id)
      }}
      className={cn(
        'absolute flex flex-col overflow-hidden bg-[#0a0a0a] shadow-2xl',
        maximized ? 'rounded-none' : 'rounded-md border border-border',
      )}
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex,
      }}
    >
      {!maximized && (
        <div
          onPointerDown={onTitlebarPointerDown}
          onDoubleClick={onTitlebarDoubleClick}
          className="flex h-7 shrink-0 cursor-grab select-none items-center gap-2 border-b border-border bg-card px-3 text-[11px] font-mono text-muted-foreground active:cursor-grabbing"
        >
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
          {badge}
          <div className="ml-auto flex items-center gap-1">
            {onMaximize ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMaximize()
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Maximize window"
              >
                <Maximize2 className="size-3" />
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close window"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">{children}</div>

      {!maximized && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute bottom-0 right-0 size-3 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, var(--muted-foreground) 50%, var(--muted-foreground) 60%, transparent 60%, transparent 70%, var(--muted-foreground) 70%, var(--muted-foreground) 80%, transparent 80%)',
          }}
        />
      )}
    </div>
  )
}

export const WindowFrame = memo(WindowFrameImpl)
