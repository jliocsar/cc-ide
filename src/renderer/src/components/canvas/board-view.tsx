import { cn } from '@/lib/utils'
import { resolveBoardMode, useBoardUi } from '@/state/board-ui'
import { useWorkspaces } from '@/state/workspaces'
import { Canvas } from './canvas'
import { DevSandbox } from './dev-sandbox'
import { GraphCanvas } from './graph-canvas'

/**
 * Wrapper that keeps both the sessions and graph canvases mounted simultaneously,
 * toggling visibility via the board-mode toggle. The sessions canvas lifetime
 * is load-bearing for xterm instances (see `tab-router.tsx` comment) — do not
 * unmount it conditionally.
 */
export function BoardView(): JSX.Element {
  const workspaceId = useWorkspaces((s) => s.activeId)
  const mode = useBoardUi((s) =>
    resolveBoardMode(workspaceId ? s.modeByWorkspace[workspaceId] : undefined),
  )

  const sessionsActive = mode === 'sessions'
  const graphActive = mode === 'graph'
  const sandboxActive = mode === 'sandbox'

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
          graphActive ? 'visible' : 'invisible pointer-events-none',
        )}
        aria-hidden={!graphActive}
      >
        <GraphCanvas />
      </div>
      {import.meta.env.DEV ? (
        <div
          className={cn(
            'absolute inset-0 [&>*]:h-full [&>*]:w-full',
            sandboxActive ? 'visible' : 'invisible pointer-events-none',
          )}
          aria-hidden={!sandboxActive}
        >
          <DevSandbox />
        </div>
      ) : null}
    </div>
  )
}
