import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ChevronRight, FolderGit2, Terminal, GitBranch, ListChecks, GitCompare } from 'lucide-react'

const SECTIONS = [
  { icon: FolderGit2, label: 'Workspaces' },
  { icon: Terminal, label: 'Sessions' },
  { icon: GitBranch, label: 'Worktrees' },
  { icon: ListChecks, label: 'Plans' },
  { icon: GitCompare, label: 'Diffs' },
] as const

export function Sidebar(): JSX.Element {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        cc-ide
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-px p-2">
          {SECTIONS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronRight className="size-3.5 shrink-0" />
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
