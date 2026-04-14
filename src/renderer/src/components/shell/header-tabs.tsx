import { cn } from '@/lib/utils'
import { LayoutGrid, X } from 'lucide-react'

type Tab = { id: string; label: string; pinned?: boolean; active?: boolean }

const STUB_TABS: Tab[] = [
  { id: 'board', label: 'Board', pinned: true, active: true },
]

export function HeaderTabs(): JSX.Element {
  return (
    <div className="flex h-10 items-center border-b border-border bg-card">
      <div className="flex h-full items-center">
        {STUB_TABS.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'flex h-full items-center gap-2 border-r border-border px-3 text-xs',
              tab.active ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.pinned ? <LayoutGrid className="size-3.5" /> : null}
            <span>{tab.label}</span>
            {!tab.pinned ? (
              <button type="button" className="rounded p-0.5 hover:bg-accent">
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
