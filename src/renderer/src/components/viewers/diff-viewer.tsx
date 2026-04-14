export function DiffViewer({
  workspaceId,
  worktreePath,
  path,
  stage,
}: {
  workspaceId: string
  worktreePath: string
  path: string
  stage: 'staged' | 'unstaged'
}): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2 font-mono text-xs text-muted-foreground">
        <div>diff viewer · phase 4.f</div>
        <div className="opacity-60">
          {workspaceId.slice(0, 8)} · {path} · {stage}
        </div>
        <div className="opacity-40">{worktreePath}</div>
      </div>
    </div>
  )
}
