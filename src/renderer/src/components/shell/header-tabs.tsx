import { LayoutGrid, X, FileText, GitCompare, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabs, type Tab } from '@/state/tabs'
import { setDropPayload, type DropPayload } from '@/lib/drop-payload'

function dragPayloadFor(tab: Tab): DropPayload | null {
  if (tab.kind === 'plan') return { kind: 'plan', workspaceId: tab.meta.workspaceId, relPath: tab.meta.relPath }
  if (tab.kind === 'diff')
    return {
      kind: 'diff',
      workspaceId: tab.meta.workspaceId,
      worktreePath: tab.meta.worktreePath,
      path: tab.meta.path,
      stage: tab.meta.stage,
    }
  return null
}

const ICON_BY_KIND: Record<Tab['kind'], React.ComponentType<{ className?: string }>> = {
  board: LayoutGrid,
  plan: FileText,
  diff: GitCompare,
  prompt: MessageSquare,
}

export function HeaderTabs(): JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const setActive = useTabs((s) => s.setActive)
  const closeTab = useTabs((s) => s.closeTab)

  return (
    <div className="flex h-10 items-center overflow-x-auto border-b border-border bg-card">
      <div className="flex h-full items-center">
        {tabs.map((tab) => {
          const Icon = ICON_BY_KIND[tab.kind]
          const active = tab.id === activeId
          const payload = dragPayloadFor(tab)
          return (
            <div
              key={tab.id}
              draggable={!!payload}
              onDragStart={(e) => {
                if (payload) setDropPayload(e.dataTransfer, payload)
              }}
              onClick={() => setActive(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && !tab.pinned) closeTab(tab.id)
              }}
              className={cn(
                'flex h-full cursor-pointer select-none items-center gap-2 border-r border-border px-3 text-xs',
                active
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span className="max-w-[200px] truncate font-mono">{tab.title}</span>
              {!tab.pinned ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close tab"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
