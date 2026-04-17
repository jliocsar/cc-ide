import { Canvas } from './canvas'
import { GraphCanvas } from './graph-canvas'
import { useBoardUi } from '@/state/board-ui'
import { useWorkspaces } from '@/state/workspaces'
import { cn } from '@/lib/utils'

/**
 * Wrapper that keeps both the sessions and graph canvases mounted simultaneously,
 * toggling visibility via the board-mode toggle. The sessions canvas lifetime
 * is load-bearing for xterm instances (see `tab-router.tsx` comment) — do not
 * unmount it conditionally.
 */
export function BoardView(): JSX.Element {
  const workspaceId = useWorkspaces((s) => s.activeId)
  const mode = useBoardUi((s) =>
    workspaceId ? (s.modeByWorkspace[workspaceId] ?? 'sessions') : 'sessions',
  )

  const sessionsActive = mode === 'sessions'

  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          'absolute inset-0 [&>*]:h-full [&>*]:w-full',
          sessionsActive ? 'visible' : 'invisible pointer-events-none',
        )}
        aria-hidden={!sessionsActive}
      >
        <Canvas />
      </div>
      <div
        className={cn(
          'absolute inset-0 [&>*]:h-full [&>*]:w-full',
          !sessionsActive ? 'visible' : 'invisible pointer-events-none',
        )}
        aria-hidden={sessionsActive}
      >
        <GraphCanvas />
      </div>
    </div>
  )
}
