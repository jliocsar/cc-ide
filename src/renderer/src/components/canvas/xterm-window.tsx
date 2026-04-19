import { memo, useCallback, useEffect, useRef, useState } from 'react'
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
import { clientToCanvasViewport, getCanvasHost } from '@/lib/canvas-host'
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
  const zoomAt = useCanvas((s) => s.zoomAt)
  const workspaceId = useWorkspaces((s) => s.activeId)
  const maximizedInfo = useMaximizedWindow((s) =>
    workspaceId ? (s.byWorkspace[workspaceId] ?? null) : null,
  )
  const setMaximized = useMaximizedWindow((s) => s.set)
  const isMaximized = maximizedInfo?.windowId === w.id
  // Only subscribe to camera while maximized — non-maximized windows otherwise
  // re-render on every pan/zoom frame because the parent canvas applies a
  // CSS transform from camera state.
  const maximizedCamera = useCanvas((s) => (isMaximized ? s.camera : null))
  const session = useSessions((s) =>
    w.sessionId ? s.sessions.find((x) => x.ptyId === w.sessionId) : undefined,
  )
  const dormant = w.sessionId === null
  const alive = session && !session.exited
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const shortName = w.tmuxWindow.split(':').slice(1).join(':') || w.tmuxWindow
  const terminalHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return
    const onWheel = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
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
    if (!workspaceId) return
    if (isMaximized) {
      setMaximized(workspaceId, null)
      return
    }
    const badge: 'live' | 'exited' | 'dormant' = dormant
      ? 'dormant'
      : session?.exited
        ? 'exited'
        : 'live'
    setMaximized(workspaceId, {
      windowId: w.id,
      title: shortName,
      badge,
      exitCode: session?.exitCode,
      onClose: requestClose,
    })
  }, [
    workspaceId,
    isMaximized,
    setMaximized,
    dormant,
    session?.exited,
    session?.exitCode,
    w.id,
    shortName,
    requestClose,
  ])

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

  let fx = w.x
  let fy = w.y
  let fw = w.width
  let fh = w.height
  let fz = w.zIndex
  if (isMaximized && maximizedCamera) {
    const host = getCanvasHost()
    const rect = host?.getBoundingClientRect()
    fx = -maximizedCamera.x / maximizedCamera.zoom
    fy = -maximizedCamera.y / maximizedCamera.zoom
    fw = (rect?.width ?? 800) / maximizedCamera.zoom
    fh = (rect?.height ?? 600) / maximizedCamera.zoom
    fz = 9999
  }

  return (
    <>
      <WindowFrame
        id={w.id}
        title={w.title}
        tmuxWindow={alive ? w.tmuxWindow : undefined}
        x={fx}
        y={fy}
        width={fw}
        height={fh}
        zIndex={fz}
        maximized={isMaximized}
        onMaximize={toggleMaximize}
        onClose={requestClose}
        badge={
          <>
            {dormant ? (
              <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                dormant
              </span>
            ) : session?.exited ? (
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-medium text-destructive">
                exit {session.exitCode ?? '—'}
              </span>
            ) : (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
                ● live
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
          <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted-foreground">
            dormant · {w.tmuxWindow}
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
