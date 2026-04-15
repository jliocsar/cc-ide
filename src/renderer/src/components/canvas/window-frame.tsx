import { useCallback, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useCanvas } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { InlineRenameInput } from '@/components/ui/inline-rename-input'
import { validateTmuxWindowName } from '@shared/tmux-name'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Props = {
  id: string
  title: string
  tmuxWindow?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  onClose?: () => void
  children: ReactNode
  badge?: ReactNode
}

const MIN_W = 320
const MIN_H = 180

export function WindowFrame({
  id,
  title,
  tmuxWindow,
  x,
  y,
  width,
  height,
  zIndex,
  onClose,
  children,
  badge,
}: Props): JSX.Element {
  const updateWindow = useCanvas((s) => s.updateWindow)
  const focusWindow = useCanvas((s) => s.focusWindow)
  const getZoom = useRef(() => useCanvas.getState().camera.zoom).current
  const [editing, setEditing] = useState(false)

  const onTitlebarPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0) return
      if (editing) return
      if (
        ev.target instanceof Element &&
        ev.target.closest('button, input, [data-rename-target]')
      )
        return
      ev.stopPropagation()
      focusWindow(id)
      const startX = ev.clientX
      const startY = ev.clientY
      const origX = x
      const origY = y
      const zoom = getZoom()
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
    [id, x, y, updateWindow, focusWindow, getZoom, editing],
  )

  const onResizePointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      focusWindow(id)
      const startX = ev.clientX
      const startY = ev.clientY
      const origW = width
      const origH = height
      const zoom = getZoom()
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
    [id, width, height, updateWindow, focusWindow, getZoom],
  )

  const shortName = tmuxWindow
    ? tmuxWindow.split(':').slice(1).join(':') || tmuxWindow
    : null
  const displayTitle = shortName ?? (title.includes(':') ? title.split(':').slice(1).join(':') || title : title)

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation()
        focusWindow(id)
      }}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-md border border-border bg-[#0a0a0a] shadow-2xl',
      )}
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex,
      }}
    >
      <div
        onPointerDown={onTitlebarPointerDown}
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

      <div className="relative flex-1 overflow-hidden">{children}</div>

      <div
        onPointerDown={onResizePointerDown}
        className="absolute bottom-0 right-0 size-3 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, oklch(0.556 0 0) 50%, oklch(0.556 0 0) 60%, transparent 60%, transparent 70%, oklch(0.556 0 0) 70%, oklch(0.556 0 0) 80%, transparent 80%)',
        }}
      />
    </div>
  )
}
