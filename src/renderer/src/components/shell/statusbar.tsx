import { useWorkspaces } from '@/state/workspaces'
import { useSessions } from '@/state/sessions'
import { useCanvas } from '@/state/canvas'
import { useLastTerminal } from '@/state/last-terminal'
import { FolderGit2, Terminal, ZoomIn } from 'lucide-react'

export function Statusbar(): JSX.Element {
  const activeId = useWorkspaces((s) => s.activeId)
  const workspaces = useWorkspaces((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null
  const sessions = useSessions((s) => s.sessions)
  const live = sessions.filter((s) => !s.exited)
  const zoom = useCanvas((s) => s.camera.zoom)
  const lastPty = useLastTerminal((s) => s.ptyId)
  const focused = lastPty ? sessions.find((s) => s.ptyId === lastPty) : null

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-1 text-[11px] leading-none text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <FolderGit2 className="size-3" />
          <span className="font-mono">{activeWorkspace?.name ?? '—'}</span>
        </span>
        <span className="flex items-center gap-1">
          <Terminal className="size-3" />
          <span className="font-mono">{live.length} live</span>
          {focused ? <span className="font-mono opacity-60">· {focused.tmuxWindow}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <ZoomIn className="size-3" />
          <span className="font-mono tabular-nums">{Math.round(zoom * 100)}%</span>
        </span>
        <span className="font-mono">cc-ide v0.0.0</span>
      </div>
    </div>
  )
}
