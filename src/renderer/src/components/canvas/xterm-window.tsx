import { useState } from 'react'
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
import { invoke } from '@/lib/ipc'

export function XtermWindow({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const session = useSessions((s) =>
    w.sessionId ? s.sessions.find((x) => x.ptyId === w.sessionId) : undefined,
  )
  const dormant = w.sessionId === null
  const alive = session && !session.exited
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

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

  return (
    <>
      <WindowFrame
        id={w.id}
        title={w.title}
        x={w.x}
        y={w.y}
        width={w.width}
        height={w.height}
        zIndex={w.zIndex}
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
          <XtermView ptyId={w.sessionId!} />
        )}
      </WindowFrame>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {w.tmuxWindow}?</AlertDialogTitle>
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
