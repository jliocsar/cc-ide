import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal, X } from 'lucide-react'
import { useSessions } from '@/state/sessions'
import { useCanvas } from '@/state/canvas'
import { getCanvasViewportCenter } from '@/lib/canvas-host'
import { invoke } from '@/lib/ipc'
import { validateTmuxWindowName } from '@shared/tmux-name'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function SessionsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const liveSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.workspaceId === workspaceId && !s.exited)
        .sort((a, b) => a.createdAt - b.createdAt),
    [sessions, workspaceId],
  )

  if (liveSessions.length === 0) {
    return (
      <div className="px-3 py-1 font-mono text-[11px] text-muted-foreground">
        no open sessions
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      {liveSessions.map((s) => (
        <SessionRow key={s.ptyId} tmuxWindow={s.tmuxWindow} ptyId={s.ptyId} />
      ))}
    </div>
  )
}

function SessionRow({ tmuxWindow, ptyId }: { tmuxWindow: string; ptyId: string }): JSX.Element {
  const panToWindow = useCanvas((s) => s.panToWindow)
  const focusWindow = useCanvas((s) => s.focusWindow)
  const removeWindow = useCanvas((s) => s.removeWindow)
  const rename = useSessions((s) => s.rename)
  const [editing, setEditing] = useState(false)

  function onActivate() {
    const canvas = useCanvas.getState()
    const match = canvas.windows.find((w) => w.tmuxWindow === tmuxWindow)
    if (!match) return
    const vp = getCanvasViewportCenter()
    panToWindow(match.id, vp)
    focusWindow(match.id)
  }

  async function onKill(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await invoke('session:killTmuxWindow', { tmuxWindow })
      await invoke('pty:close', { ptyId })
      const match = useCanvas.getState().windows.find((w) => w.tmuxWindow === tmuxWindow)
      if (match) removeWindow(match.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (editing) {
    return (
      <SessionRenameRow
        currentName={tmuxWindow.split(':').slice(1).join(':')}
        onCancel={() => setEditing(false)}
        onCommit={async (next) => {
          try {
            await rename(tmuxWindow, next)
            setEditing(false)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err))
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'F2') {
          e.preventDefault()
          setEditing(true)
        }
      }}
      className="group flex min-w-0 items-center gap-2 px-3 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/50 focus-visible:text-foreground focus-visible:outline-none"
    >
      <Terminal className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono">{tmuxWindow.split(':').slice(1).join(':')}</span>
      <span
        className={cn(
          'shrink-0 rounded-sm border border-green-500/30 bg-green-500/15 px-1 py-px font-mono text-[9px] uppercase tracking-wider text-green-400',
        )}
      >
        live
      </span>
      <span
        role="button"
        tabIndex={-1}
        onClick={onKill}
        aria-label="Kill session"
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3" />
      </span>
    </button>
  )
}

function SessionRenameRow({
  currentName,
  onCommit,
  onCancel,
}: {
  currentName: string
  onCommit: (next: string) => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(currentName)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const validation = validateTmuxWindowName(value)
  const valid = validation.ok

  async function commit() {
    if (!valid || value === currentName || pending) return
    setPending(true)
    try {
      await onCommit(value)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-1 text-[11px]">
      <Terminal className="size-3 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault()
            onCancel()
          }
        }}
        onBlur={() => {
          if (!pending) onCancel()
        }}
        title={valid ? undefined : (validation as { ok: false; reason: string }).reason}
        className={cn(
          'min-w-0 flex-1 rounded-sm border bg-background px-1 py-px font-mono text-[11px] outline-none focus:ring-1',
          valid
            ? 'border-border focus:ring-ring'
            : 'border-destructive focus:ring-destructive',
        )}
      />
    </div>
  )
}
