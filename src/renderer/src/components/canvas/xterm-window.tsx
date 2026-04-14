import { WindowFrame } from './window-frame'
import { XtermView } from '@/components/terminal/xterm-view'
import { useCanvas, type CanvasWindow } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { invoke } from '@/lib/ipc'

export function XtermWindow({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const session = useSessions((s) => s.sessions.find((x) => x.ptyId === w.sessionId))

  async function close() {
    if (session && !session.exited) {
      await invoke('pty:close', { ptyId: session.ptyId })
    }
    removeWindow(w.id)
  }

  return (
    <WindowFrame
      id={w.id}
      title={session?.tmuxWindow ?? w.title}
      x={w.x}
      y={w.y}
      width={w.width}
      height={w.height}
      zIndex={w.zIndex}
      onClose={close}
      badge={
        session?.exited ? (
          <span className="text-destructive">exit {session.exitCode ?? '—'}</span>
        ) : (
          <span className="text-green-500">● live</span>
        )
      }
    >
      <XtermView ptyId={w.sessionId} />
    </WindowFrame>
  )
}
