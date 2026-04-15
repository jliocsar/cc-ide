import { useMemo, useState } from 'react'
import { Pencil, Terminal, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessions } from '@/state/sessions'
import { useCanvas } from '@/state/canvas'
import { getCanvasViewportCenter } from '@/lib/canvas-host'
import { invoke } from '@/lib/ipc'
import { validateTmuxWindowName } from '@shared/tmux-name'
import { InlineRenameInput } from '@/components/ui/inline-rename-input'
import { toast } from 'sonner'

type MenuState = { tmuxWindow: string; ptyId: string; x: number; y: number } | null

export function SessionsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const [menu, setMenu] = useState<MenuState>(null)
  const [editingTmuxWindow, setEditingTmuxWindow] = useState<string | null>(null)

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
        <SessionRow
          key={s.ptyId}
          tmuxWindow={s.tmuxWindow}
          ptyId={s.ptyId}
          editing={editingTmuxWindow === s.tmuxWindow}
          onStartEdit={() => setEditingTmuxWindow(s.tmuxWindow)}
          onStopEdit={() => setEditingTmuxWindow(null)}
          onContextMenu={(x, y) => setMenu({ tmuxWindow: s.tmuxWindow, ptyId: s.ptyId, x, y })}
        />
      ))}

      <DropdownMenu
        open={menu !== null}
        onOpenChange={(v) => {
          if (!v) setMenu(null)
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            style={{
              position: 'fixed',
              left: menu?.x ?? 0,
              top: menu?.y ?? 0,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0}>
          <DropdownMenuItem
            onClick={() => {
              if (!menu) return
              setEditingTmuxWindow(menu.tmuxWindow)
              setMenu(null)
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

type RowProps = {
  tmuxWindow: string
  ptyId: string
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onContextMenu: (x: number, y: number) => void
}

function SessionRow({
  tmuxWindow,
  ptyId,
  editing,
  onStartEdit,
  onStopEdit,
  onContextMenu,
}: RowProps): JSX.Element {
  const panToWindow = useCanvas((s) => s.panToWindow)
  const focusWindow = useCanvas((s) => s.focusWindow)
  const removeWindow = useCanvas((s) => s.removeWindow)
  const rename = useSessions((s) => s.rename)
  const shortName = tmuxWindow.split(':').slice(1).join(':') || tmuxWindow

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
      <div className="flex min-w-0 items-center gap-2 px-3 py-1 text-[11px]">
        <Terminal className="size-3 shrink-0 text-muted-foreground" />
        <InlineRenameInput
          className="flex-1"
          value={shortName}
          validate={validateTmuxWindowName}
          onCancel={onStopEdit}
          onCommit={async (next) => {
            try {
              await rename(tmuxWindow, next)
              onStopEdit()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err))
            }
          }}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={onActivate}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY)
      }}
      onKeyDown={(e) => {
        if (e.key === 'F2') {
          e.preventDefault()
          onStartEdit()
        }
      }}
      className="group flex min-w-0 items-start gap-2 px-3 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/50 focus-visible:text-foreground focus-visible:outline-none"
    >
      <Terminal className="mt-0.5 size-3 shrink-0" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono">{shortName}</span>
          <span className="shrink-0 rounded-sm border border-green-500/30 bg-green-500/15 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-400">
            live
          </span>
        </div>
        <div className="truncate text-[10px] text-muted-foreground/60">
          {ptyId}
        </div>
      </div>
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
