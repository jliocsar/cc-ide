import { BoardView } from '@/components/canvas/board-view'
import { DiffViewer } from '@/components/viewers/diff-viewer'
import { PlanViewer } from '@/components/viewers/plan-viewer'
import { PromptViewer } from '@/components/viewers/prompt-viewer'
import { cn } from '@/lib/utils'
import { useTabs } from '@/state/tabs'

// Why this lives here vs the obvious "switch on active.kind":
//
// The Board owns long-lived xterm Terminal instances. If we let the Canvas
// unmount when the user switches to a non-board tab, every Terminal disposes;
// when the user comes back, the new Terminal starts blank because xterm's
// screen state is in JS, not in the pty. The pty (and tmux + claude inside it)
// keep running silently — but the renderer has no way to repaint the previous
// frame until the next byte of pty output arrives, hence the "black screen
// until you interact" symptom.
//
// Fix: keep <Canvas /> mounted always, and hide it via visibility:hidden +
// position:absolute when another tab is active. Crucially NOT display:none —
// xterm's FitAddon needs a measurable size, and a 0×0 host triggers a
// fit-to-zero on the way out and a re-fit on the way back, which is its own
// can of worms.
//
// Non-board viewers (Plan/Prompt/Diff) are stateless re-mountable surfaces, so
// they continue to mount/unmount on activation — keeps the memory profile
// reasonable when many plan tabs are open.
export function TabRouter(): JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!
  const boardActive = active.kind === 'board'

  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          'absolute inset-0 [&>*]:h-full [&>*]:w-full',
          boardActive ? 'visible' : 'invisible pointer-events-none',
        )}
        aria-hidden={!boardActive}
      >
        <BoardView />
      </div>
      {!boardActive ? (
        <div className="relative z-10 h-full w-full [&>*]:h-full">
          <ActiveTabView />
        </div>
      ) : null}
    </div>
  )
}

function ActiveTabView(): JSX.Element | null {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!

  switch (active.kind) {
    case 'board':
      return null
    case 'plan':
      return <PlanViewer workspaceId={active.meta.workspaceId} relPath={active.meta.relPath} />
    case 'diff':
      return (
        <DiffViewer
          workspaceId={active.meta.workspaceId}
          worktreePath={active.meta.worktreePath}
          path={active.meta.path}
          stage={active.meta.stage}
        />
      )
    case 'prompt':
      return <PromptViewer workspaceId={active.meta.workspaceId} relPath={active.meta.relPath} />
  }
}
