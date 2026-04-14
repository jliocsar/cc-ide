import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Terminal } from 'lucide-react'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'
import { XtermView } from '@/components/terminal/xterm-view'

export function Canvas(): JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const activePtyId = useSessions((s) => s.activePtyId)
  const setActive = useSessions((s) => s.setActive)
  const spawn = useSessions((s) => s.spawn)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const [spawning, setSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSpawn() {
    if (!activeWorkspaceId) {
      setError('Add a workspace first.')
      return
    }
    setSpawning(true)
    setError(null)
    try {
      await spawn(activeWorkspaceId, 120, 30)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSpawning(false)
    }
  }

  const activeSession = sessions.find((s) => s.ptyId === activePtyId) ?? null

  return (
    <div className="relative flex flex-col overflow-hidden bg-background">
      {sessions.length > 0 ? (
        <div className="flex h-7 items-center gap-px border-b border-border bg-card px-1">
          {sessions.map((s) => (
            <button
              key={s.ptyId}
              type="button"
              onClick={() => setActive(s.ptyId)}
              className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${
                s.ptyId === activePtyId ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <Terminal className="size-3" />
              <span className="font-mono">{s.tmuxWindow}</span>
              {s.exited ? <span className="text-destructive">· exited</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative flex-1">
        {activeSession ? (
          <div className="absolute inset-3 overflow-hidden rounded border border-border bg-[#0a0a0a] shadow-xl">
            <div className="flex h-7 items-center justify-between border-b border-border bg-card px-3 text-[11px] font-mono text-muted-foreground">
              <span>{activeSession.tmuxWindow}</span>
              {activeSession.exited ? <span className="text-destructive">exit {activeSession.exitCode ?? '—'}</span> : <span>● live</span>}
            </div>
            <div className="h-[calc(100%-28px)]">
              <XtermView ptyId={activeSession.ptyId} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: 'radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="relative flex flex-col items-center gap-3">
              <div className="font-mono text-xs text-muted-foreground">empty canvas</div>
              <Button size="sm" onClick={onSpawn} disabled={spawning || !activeWorkspaceId}>
                {spawning ? 'spawning…' : 'Spawn Claude'}
              </Button>
              {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
              {!activeWorkspaceId ? (
                <div className="font-mono text-[11px] text-muted-foreground">pick a workspace from the sidebar</div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
