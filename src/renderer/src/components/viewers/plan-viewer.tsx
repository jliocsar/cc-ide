export function PlanViewer({ workspaceId, relPath }: { workspaceId: string; relPath: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2 font-mono text-xs text-muted-foreground">
        <div>plan viewer · phase 4.c</div>
        <div className="opacity-60">
          {workspaceId.slice(0, 8)} · {relPath}
        </div>
      </div>
    </div>
  )
}
