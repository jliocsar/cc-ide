export function Statusbar(): JSX.Element {
  return (
    <div className="flex items-center justify-between border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      <span>ready</span>
      <span className="font-mono">v0.0.0</span>
    </div>
  )
}
