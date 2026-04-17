import { useEffect, useRef, useState } from 'react'
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
import { WindowFrame } from './window-frame'
import { XtermView } from '@/components/terminal/xterm-view'
import { useCanvas, type CanvasWindow } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useMaximizedWindow } from '@/state/maximized-window'
import { useWorkspaces } from '@/state/workspaces'
import { clientToCanvasViewport, getCanvasHost } from '@/lib/canvas-host'
import { useReviewComments, planTabId, diffTabId } from '@/state/review-comments'
import { invoke } from '@/lib/ipc'
import { readDropPayload, buildDropString, type DropPayload } from '@/lib/drop-payload'

export function XtermWindow({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const camera = useCanvas((s) => s.camera)
  const zoomAt = useCanvas((s) => s.zoomAt)
  const workspaceId = useWorkspaces((s) => s.activeId)
  const maximizedInfo = useMaximizedWindow((s) =>
    workspaceId ? (s.byWorkspace[workspaceId] ?? null) : null,
  )
  const setMaximized = useMaximizedWindow((s) => s.set)
  const isMaximized = maximizedInfo?.windowId === w.id
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
    return () => host.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [zoomAt])

  async function handleDrop(payload: DropPayload) {
    if (!session || session.exited) return
    if (payload.kind === 'prompt' || payload.kind === 'file') {
      const dropText = buildDropString(payload, [])
      await invoke('pty:write', { ptyId: session.ptyId, data: dropText })
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
  }

  function requestClose() {
    if (!alive) {
      removeWindow(w.id)
      return
    }
    setConfirmOpen(true)
  }

  async function detach() {
    if (busy) return
    setBusy(true)
    try {
      if (session) await invoke('pty:close', { ptyId: session.ptyId })
      removeWindow(w.id)
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  async function kill() {
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
  }

  function toggleMaximize() {
    if (!workspaceId) return
    if (isMaximized) {
      setMaximized(workspaceId, null)
    } else {
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
    }
  }

  let fx = w.x
  let fy = w.y
  let fw = w.width
  let fh = w.height
  let fz = w.zIndex
  if (isMaximized) {
    const host = getCanvasHost()
    const rect = host?.getBoundingClientRect()
    fx = -camera.x / camera.zoom
    fy = -camera.y / camera.zoom
    fw = (rect?.width ?? 800) / camera.zoom
    fh = (rect?.height ?? 600) / camera.zoom
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
          dormant ? (
            <span className="text-muted-foreground">dormant</span>
          ) : session?.exited ? (
            <span className="text-destructive">exit {session.exitCode ?? '—'}</span>
          ) : (
            <span className="text-green-500">● live</span>
          )
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
            onDragOver={(e) => {
              if (!session || session.exited) return
              if (!e.dataTransfer.types.includes('application/x-cc-ide-drop')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (!dragOver) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const payload = readDropPayload(e.dataTransfer)
              if (payload) void handleDrop(payload)
            }}
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
              <strong>Detach</strong> closes this view; the Claude session keeps running in tmux and can be reattached.
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
