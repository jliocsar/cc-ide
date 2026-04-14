import { useEffect } from 'react'
import { Terminal, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarData } from '@/state/sidebar-data'
import { cn } from '@/lib/utils'

export function SessionsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const sessions = useSidebarData((s) => s.sessions)
  const status = useSidebarData((s) => s.sessionsStatus)
  const error = useSidebarData((s) => s.sessionsError)
  const refresh = useSidebarData((s) => s.refreshSessions)

  useEffect(() => {
    void refresh(workspaceId)
  }, [workspaceId, refresh])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status === 'loading' ? 'loading…' : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => void refresh(workspaceId)}
          aria-label="Refresh sessions"
        >
          <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
        </Button>
      </div>
      {error ? <div className="px-2 py-1 font-mono text-[11px] text-destructive">{error}</div> : null}
      <div className="flex flex-col gap-px">
        {sessions.map((s) => (
          <div
            key={s.id}
            title={s.firstUserMessage ?? s.id}
            className="flex items-start gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Terminal className="mt-0.5 size-3 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono">{s.firstUserMessage ?? '(no user messages)'}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {new Date(s.updatedAt).toLocaleString()} · {s.messageCount} msg
              </div>
            </div>
          </div>
        ))}
        {status === 'ready' && sessions.length === 0 ? (
          <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">no sessions yet</div>
        ) : null}
      </div>
    </div>
  )
}
