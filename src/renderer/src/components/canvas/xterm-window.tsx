import { Loader2, Play } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { XtermView } from '@/components/terminal/xterm-view'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { clientToCanvasViewport } from '@/lib/canvas-host'
import { buildDropString, type DropPayload, readDropPayload } from '@/lib/drop-payload'
import { invoke } from '@/lib/ipc'
import { type CanvasWindow, useCanvas } from '@/state/canvas'
import { useMaximizedWindow } from '@/state/maximized-window'
import { diffTabId, planTabId, useReviewComments } from '@/state/review-comments'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'
import { WindowFrame } from './window-frame'

function XtermWindowImpl({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const updateWindow = useCanvas((s) => s.updateWindow)
  const zoomAt = useCanvas((s) => s.zoomAt)
  const resumeSession = useSessions((s) => s.resume)
  const session = useSessions((s) =>
    w.sessionId ? s.sessions.find((x) => x.ptyId === w.sessionId) : undefined,
  )
  const dormant = w.sessionId === null
  const alive = session && !session.exited
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const shortName = w.tmuxWindow.split(':').slice(1).join(':') || w.tmuxWindow
  const terminalHostRef = useRef<HTMLDivElement>(null)

  // Read paged/maximized state on demand so this component does NOT
  // re-render when the user maximizes/restores. Canvas owns the
  // [data-paged] attr; CSS handles the layout flip.
  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return
    const onWheel = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const wsId = useWorkspaces.getState().activeId
      const paged = wsId ? useMaximizedWindow.getState().byWorkspace[wsId] != null : false
      // In paged mode, the canvas-level handler routes Ctrl+wheel into
      // the horizontal snap scroller. Yield to it.
      if (paged) return
      ev.preventDefault()
      ev.stopPropagation()
      const vp = clientToCanvasViewport(ev.clientX, ev.clientY)
      if (!vp) return
      const factor = Math.exp(-ev.deltaY * 0.0015)
      zoomAt(factor, vp.x, vp.y)
    }
    host.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () =>
      host.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [zoomAt])

  const handleDrop = useCallback(
    async (payload: DropPayload) => {
      if (!session || session.exited) return
      if (payload.kind === 'prompt' || payload.kind === 'file') {
        const dropText = buildDropString(payload, [])
        await invoke('pty:write', { ptyId: session.ptyId, data: dropText })
        return
      }
      if (payload.kind === 'diff-batch') {
        const state = useReviewComments.getState()
        const parts = payload.files.flatMap((f) => {
          const tabId = diffTabId(payload.worktreePath, f.path, f.stage)
          const ranges = state.ranges(tabId)
          if (ranges.length === 0) return []
          const filePayload: DropPayload = {
            kind: 'diff',
            workspaceId: payload.workspaceId,
            worktreePath: payload.worktreePath,
            path: f.path,
            stage: f.stage,
          }
          return [buildDropString(filePayload, ranges)]
        })
        if (parts.length === 0) return
        await invoke('pty:write', { ptyId: session.ptyId, data: parts.join('') })
        payload.files.forEach((f) => {
          state.clear(diffTabId(payload.worktreePath, f.path, f.stage))
        })
        return
      }
      const tabId =
        payload.kind === 'plan'
          ? planTabId(payload.workspaceId, payload.relPath)
          : diffTabId(payload.worktreePath, payload.path, payload.stage)
      const ranges = useReviewComments.getState().ranges(tabId)
      const dropText = buildDropString(payload, ranges)
      await invoke('pty:write', { ptyId: session.ptyId, data: dropText })
      useReviewComments.getState().clear(tabId)
    },
    [session],
  )

  const requestClose = useCallback(() => {
    if (!alive) {
      removeWindow(w.id)
      return
    }
    setConfirmOpen(true)
  }, [alive, removeWindow, w.id])

  const detach = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (session) await invoke('pty:close', { ptyId: session.ptyId })
      removeWindow(w.id)
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }, [busy, session, removeWindow, w.id])

  const kill = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await invoke('session:killTmuxWindow', { tmuxWindow: w.tmuxWindow })
      if (session) await invoke('pty:close', { ptyId: session.ptyId })
      removeWindow(w.id)
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }, [busy, session, removeWindow, w.id, w.tmuxWindow])

  const toggleMaximize = useCallback(() => {
    const wsId = useWorkspaces.getState().activeId
    if (!wsId) return
    const cur = useMaximizedWindow.getState().byWorkspace[wsId] ?? null
    useMaximizedWindow.getState().set(wsId, cur === w.id ? null : w.id)
  }, [w.id])

  const onTerminalDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!session || session.exited) return
      if (!e.dataTransfer.types.includes('application/x-cc-ide-drop')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (!dragOver) setDragOver(true)
    },
    [session, dragOver],
  )

  const onTerminalDragLeave = useCallback(() => setDragOver(false), [])

  const onTerminalDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const payload = readDropPayload(e.dataTransfer)
      if (payload) void handleDrop(payload)
    },
    [handleDrop],
  )

  const canResume = Boolean(w.lastClaudeSessionId && w.cwd)

  const onResume = useCallback(async () => {
    if (resuming || !canResume) return
    const workspaceId = useWorkspaces.getState().activeId
    if (!workspaceId) return
    const claudeSessionId = w.lastClaudeSessionId
    const cwd = w.cwd
    if (!claudeSessionId || !cwd) return
    setResuming(true)
    try {
      // Insurance: rehydrateLiveSessions runs on workspace activate, but the
      // user may click before it finishes or after tmux revived externally.
      const attach = await invoke('session:attachExisting', {
        workspaceId,
        tmuxWindow: w.tmuxWindow,
        cols: 120,
        rows: 30,
      })
      if (attach.exists && attach.ptyId) {
        useSessions
          .getState()
          .registerExisting({ ptyId: attach.ptyId, tmuxWindow: w.tmuxWindow, workspaceId })
        updateWindow(w.id, { sessionId: attach.ptyId })
        return
      }
      const { ptyId } = await resumeSession(workspaceId, claudeSessionId, 120, 30, {
        customName: shortName,
        worktreePath: cwd,
      })
      updateWindow(w.id, { sessionId: ptyId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Resume failed: ${msg}`)
    } finally {
      setResuming(false)
    }
  }, [
    resuming,
    canResume,
    w.id,
    w.tmuxWindow,
    w.cwd,
    w.lastClaudeSessionId,
    shortName,
    resumeSession,
    updateWindow,
  ])

  return (
    <>
      <WindowFrame
        id={w.id}
        title={w.title}
        tmuxWindow={alive ? w.tmuxWindow : undefined}
        x={w.x}
        y={w.y}
        width={w.width}
        height={w.height}
        zIndex={w.zIndex}
        onMaximize={toggleMaximize}
        onClose={requestClose}
        badge={
          <>
            {dormant ? (
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70"
                title="dormant"
              >
                <svg viewBox="0 0 12 12" className="size-3 text-muted-foreground/60" aria-hidden>
                  <path
                    d="M2 3 L6 3 L2 8 L6 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6 6 L9 6 L6 9 L9 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                dormant
              </span>
            ) : session?.exited ? (
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-red-500/80"
                title="exited"
              >
                <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                  <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
                  <path d="M4 4 L8 8 M8 4 L4 8" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                exit {session.exitCode ?? '—'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
                <span
                  className="size-1.5 rounded-full bg-green-500"
                  style={{ animation: 'cc-pill-glow 1.8s ease-out infinite' }}
                />
                live
              </span>
            )}
            {session?.worktreeBranch ? (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                {session.worktreeBranch}
              </span>
            ) : null}
          </>
        }
      >
        {dormant ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 font-mono text-[11px] text-muted-foreground">
            <span>dormant · {w.tmuxWindow}</span>
            {canResume ? (
              <Button size="sm" onClick={() => void onResume()} disabled={resuming}>
                {resuming ? <Loader2 className="animate-spin" /> : <Play />}
                {resuming ? 'Resuming…' : 'Resume'}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" disabled>
                      <Play />
                      Resume
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  No known Claude session for this window. Close the card and start a fresh
                  terminal.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <div
            ref={terminalHostRef}
            className="relative h-full"
            onDragOver={onTerminalDragOver}
            onDragLeave={onTerminalDragLeave}
            onDrop={onTerminalDrop}
          >
            <XtermView ptyId={w.sessionId!} />
            {dragOver ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 ring-2 ring-inset ring-primary/40">
                <span className="rounded bg-primary/80 px-2 py-1 font-mono text-[11px] text-primary-foreground">
                  drop to paste
                </span>
              </div>
            ) : null}
          </div>
        )}
      </WindowFrame>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {shortName}?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Detach</strong> closes this view; the Claude session keeps running in tmux and
              can be reattached.
              <br />
              <strong>Kill</strong> also terminates the tmux window and its Claude process.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void detach()
              }}
              disabled={busy}
            >
              Detach
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void kill()
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Kill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const XtermWindow = memo(XtermWindowImpl)
