// TODO(drift-prone): this registry is hand-maintained — duplicating, not
// referenced by, the actual handlers. When you add a shortcut, also add it
// here. Migrate to a single source of truth when keybinds become user-customizable.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Scope = 'Global' | 'Canvas' | 'Sidebar' | 'Editor'

type Keybind = { keys: string[]; scope: Scope; label: string }

const KEYBINDS: Keybind[] = [
  { keys: ['F1'], scope: 'Global', label: 'Show keyboard shortcuts' },
  { keys: ['Ctrl', 'K'], scope: 'Global', label: 'Open command palette' },
  { keys: ['Ctrl', 'B'], scope: 'Global', label: 'Toggle sidebar' },
  { keys: ['Ctrl', 'W'], scope: 'Global', label: 'Close active tab' },
  { keys: ['Ctrl', 'Tab'], scope: 'Global', label: 'Next tab' },
  { keys: ['Ctrl', 'Shift', 'Tab'], scope: 'Global', label: 'Previous tab' },

  { keys: ['Ctrl', 'Shift', 'N'], scope: 'Canvas', label: 'New Claude session' },
  { keys: ['Ctrl', 'Shift', 'F'], scope: 'Canvas', label: 'Toggle maximize focused window' },
  { keys: ['Ctrl', '0'], scope: 'Canvas', label: 'Reset camera' },
  { keys: ['Ctrl', '='], scope: 'Canvas', label: 'Zoom in' },
  { keys: ['Ctrl', '-'], scope: 'Canvas', label: 'Zoom out' },

  { keys: ['F2'], scope: 'Sidebar', label: 'Rename session row' },
]

const SCOPE_ORDER: Scope[] = ['Global', 'Canvas', 'Sidebar', 'Editor']

export function KeybindsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const grouped = new Map<Scope, Keybind[]>()
  for (const kb of KEYBINDS) {
    const arr = grouped.get(kb.scope) ?? []
    arr.push(kb)
    grouped.set(kb.scope, arr)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press F1 again or Esc to close.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {SCOPE_ORDER.filter((s) => grouped.has(s)).map((scope) => (
            <section key={scope} className="flex flex-col gap-1">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {scope}
              </h3>
              <div className="flex flex-col">
                {grouped.get(scope)?.map((kb) => (
                  <div
                    key={kb.keys.join('+') + kb.label}
                    className="flex items-center justify-between gap-2 py-1 text-xs"
                  >
                    <span>{kb.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {kb.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 ? <span className="text-muted-foreground/60">+</span> : null}
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
