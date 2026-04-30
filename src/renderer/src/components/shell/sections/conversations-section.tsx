import { useVirtualizer } from '@tanstack/react-virtual'
import { Copy, MessageSquare, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getCanvasViewportCenter } from '@/lib/canvas-host'
import { invoke } from '@/lib/ipc'
import { MAX_WINDOWS_PER_WORKSPACE, useCanvas, worldFromViewport } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useSidebarData } from '@/state/sidebar-data'

const DEFAULT_WIN_W = 720
const DEFAULT_WIN_H = 440
const ROW_HEIGHT = 36
const VISIBLE_ROWS = 5

export function ConversationsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const conversations = useSidebarData((s) => s.conversations)
  const status = useSidebarData((s) => s.conversationsStatus)
  const error = useSidebarData((s) => s.conversationsError)
  const resumeSession = useSessions((s) => s.resume)
  const atCap = useCanvas((s) => s.windows.length >= MAX_WINDOWS_PER_WORKSPACE)
  const [resuming, setResuming] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  })

  async function onResume(sessionId: string) {
    if (resuming) return
    if (useCanvas.getState().windows.length >= MAX_WINDOWS_PER_WORKSPACE) {
      toast.error(`Workspace capped at ${MAX_WINDOWS_PER_WORKSPACE} terminals. Close one first.`)
      return
    }
    setResuming(sessionId)
    try {
      const { ptyId, tmuxWindow, cwd } = await resumeSession(workspaceId, sessionId, 120, 30)
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
        cwd,
        lastClaudeSessionId: sessionId,
      })
    } catch (err) {
      console.error('[resume]', err)
    } finally {
      setResuming(null)
    }
  }

  if (error) {
    return <div className="px-3 py-1 font-mono text-[11px] text-destructive">{error}</div>
  }

  if (status === 'ready' && conversations.length === 0) {
    return (
      <div className="px-3 py-1 font-mono text-[11px] text-muted-foreground">
        no conversations yet
      </div>
    )
  }

  const totalSize = virtualizer.getTotalSize()
  const items = virtualizer.getVirtualItems()
  const viewportHeight = ROW_HEIGHT * VISIBLE_ROWS
  const useFixedHeight = conversations.length > VISIBLE_ROWS

  return (
    <ScrollFade
      ref={scrollRef}
      className="min-w-0"
      innerClassName="overscroll-contain"
      style={useFixedHeight ? { height: viewportHeight } : undefined}
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {items.map((vi) => {
          const s = conversations[vi.index]
          if (!s) return null
          return (
            <div
              key={s.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <ContextMenu>
                <Tooltip>
                  <ContextMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <div className="group flex min-w-0 items-start gap-2 px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                        <MessageSquare className="mt-0.5 size-3 shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="truncate font-mono">
                            {s.firstUserMessage ?? '(no user messages)'}
                          </div>
                          <div className="truncate text-[10px] tabular-nums text-muted-foreground/60">
                            {new Date(s.updatedAt).toLocaleString()} · {s.messageCount} msg
                          </div>
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={resuming !== null || atCap}
                          onClick={() => void onResume(s.id)}
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={
                            atCap
                              ? `At ${MAX_WINDOWS_PER_WORKSPACE}-terminal cap`
                              : 'Resume conversation'
                          }
                        >
                          <Play />
                        </Button>
                      </div>
                    </TooltipTrigger>
                  </ContextMenuTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    {s.firstUserMessage ?? s.id}
                  </TooltipContent>
                </Tooltip>
                <ContextMenuContent>
                  <ContextMenuItem
                    disabled={resuming !== null || atCap}
                    onSelect={() => void onResume(s.id)}
                  >
                    <Play />
                    Resume in new session
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void invoke('clipboard:write', { text: s.id }).then(() =>
                        toast.success('Copied session id'),
                      )
                    }}
                  >
                    <Copy />
                    Copy session id
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          )
        })}
      </div>
    </ScrollFade>
  )
}
