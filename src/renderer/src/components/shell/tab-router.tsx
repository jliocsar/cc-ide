import { useTabs } from '@/state/tabs'
import { Canvas } from '@/components/canvas/canvas'
import { PlanViewer } from '@/components/viewers/plan-viewer'
import { DiffViewer } from '@/components/viewers/diff-viewer'
import { PromptViewer } from '@/components/viewers/prompt-viewer'

export function TabRouter(): JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!

  switch (active.kind) {
    case 'board':
      return <Canvas />
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
      return (
        <PromptViewer
          workspaceId={active.meta.workspaceId}
          relPath={active.meta.relPath}
        />
      )
  }
}
