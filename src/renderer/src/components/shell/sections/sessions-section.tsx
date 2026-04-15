import { useEffect, useState } from 'react'
import { Terminal, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarData } from '@/state/sidebar-data'
import { useSessions } from '@/state/sessions'
import { useCanvas, worldFromViewport } from '@/state/canvas'
import { getCanvasViewportCenter } from '@/lib/canvas-host'

const DEFAULT_WIN_W = 720
const DEFAULT_WIN_H = 440

export function SessionsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const sessions = useSidebarData((s) => s.sessions)
  const status = useSidebarData((s) => s.sessionsStatus)
  const error = useSidebarData((s) => s.sessionsError)
  const refresh = useSidebarData((s) => s.refreshSessions)
  const resumeSession = useSessions((s) => s.resume)
  const [resuming, setResuming] = useState<string | null>(null)

  useEffect(() => {
    void refresh(workspaceId)
  }, [workspaceId, refresh])

  async function onResume(sessionId: string) {
    if (resuming) return
    setResuming(sessionId)
    try {
      const { ptyId, tmuxWindow } = await resumeSession(workspaceId, sessionId, 120, 30)
      const { camera, addWindow, windows } = useCanvas.getState()
      const vp = getCanvasViewportCenter()
      const offset = (windows.length % 6) * 24
      const world = worldFromViewport(vp.x + offset, vp.y + offset, camera)
      addWindow({
        id: crypto.randomUUID(),
        sessionId: ptyId,
        tmuxWindow,
        title: tmuxWindow,
        x: world.x - DEFAULT_WIN_W / 2,
        y: world.y - DEFAULT_WIN_H / 2,
        width: DEFAULT_WIN_W,
        height: DEFAULT_WIN_H,
      })
    } catch (err) {
      console.error('[resume]', err)
    } finally {
      setResuming(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      {error ? <div className="px-3 py-1 font-mono text-[11px] text-destructive">{error}</div> : null}
      <div className="flex flex-col">
        {sessions.map((s) => (
          <div
            key={s.id}
            title={s.firstUserMessage ?? s.id}
            className="group flex min-w-0 items-start gap-2 px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Terminal className="mt-0.5 size-3 shrink-0" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate font-mono">{s.firstUserMessage ?? '(no user messages)'}</div>
              <div className="truncate text-[10px] text-muted-foreground/60">
                {new Date(s.updatedAt).toLocaleString()} · {s.messageCount} msg
              </div>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={resuming !== null}
              onClick={() => void onResume(s.id)}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Resume session"
            >
              <Play />
            </Button>
          </div>
        ))}
        {status === 'ready' && sessions.length === 0 ? (
          <div className="px-3 py-1 font-mono text-[11px] text-muted-foreground">no sessions yet</div>
        ) : null}
      </div>
    </div>
  )
}
