export function PromptViewer({ promptId }: { promptId: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2 font-mono text-xs text-muted-foreground">
        <div>prompt viewer · phase 6</div>
        <div className="opacity-60">{promptId}</div>
      </div>
    </div>
  )
}
