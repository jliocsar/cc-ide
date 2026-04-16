import { useState } from 'react'
import { LayoutGrid, X, FileText, GitCompare, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabs, type Tab } from '@/state/tabs'
import { usePlanTabUi } from '@/state/plan-tab-ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { setDropPayload, type DropPayload } from '@/lib/drop-payload'

const TAB_REORDER_MIME = 'application/x-cc-ide-tab-reorder'

let cachedTransparentDragImage: HTMLImageElement | null = null

function transparentDragImage(): HTMLImageElement {
  if (cachedTransparentDragImage) return cachedTransparentDragImage
  const img = new Image()
  img.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  cachedTransparentDragImage = img
  return img
}

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
  const reorderTab = useTabs((s) => s.reorderTab)
  const dirtyMap = usePlanTabUi((s) => s.byTab)
  const pendingCloseId = usePlanTabUi((s) => s.pendingCloseId)
  const setPendingCloseId = usePlanTabUi((s) => s.setPendingCloseId)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function requestClose(id: string): void {
    const isDirty = dirtyMap[id]?.dirty ?? false
    if (isDirty) {
      setPendingCloseId(id)
      return
    }
    closeTab(id)
  }

  return (
    <div className="flex h-10 items-center overflow-x-auto border-b border-border bg-card">
      <div className="flex h-full items-center">
        {tabs.map((tab) => {
          const Icon = ICON_BY_KIND[tab.kind]
          const active = tab.id === activeId
          const payload = dragPayloadFor(tab)
          const canReorder = !tab.pinned
          const dirty = dirtyMap[tab.id]?.dirty ?? false
          return (
            <div
              key={tab.id}
              draggable={!!payload || canReorder}
              onDragStart={(e) => {
                if (payload) setDropPayload(e.dataTransfer, payload)
                if (canReorder) {
                  e.dataTransfer.setData(TAB_REORDER_MIME, tab.id)
                  // Hide the OS-rendered drag image so the live reorder is the
                  // only visual feedback. setDragImage(0,0) keeps the OS happy
                  // about having an image to attach to.
                  e.dataTransfer.setDragImage(transparentDragImage(), 0, 0)
                  setDraggingId(tab.id)
                }
                e.dataTransfer.effectAllowed = 'copyMove'
              }}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TAB_REORDER_MIME)) return
                if (tab.pinned) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (draggingId && draggingId !== tab.id) {
                  reorderTab(draggingId, tab.id)
                }
              }}
              onDrop={(e) => {
                const srcId = e.dataTransfer.getData(TAB_REORDER_MIME)
                setDraggingId(null)
                if (!srcId) return
                e.preventDefault()
                // The live reorder during dragover already moved the tab into
                // place; the drop is just the commit signal.
                if (srcId !== tab.id) reorderTab(srcId, tab.id)
              }}
              onClick={() => setActive(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && !tab.pinned) requestClose(tab.id)
              }}
              className={cn(
                'relative flex h-full cursor-pointer select-none items-center gap-2 border-r border-border px-3 text-xs',
                active
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                draggingId === tab.id ? 'opacity-60' : null,
              )}
            >
              <Icon className="size-3.5" />
              <span className="max-w-[200px] truncate font-mono">
                {dirty ? <span className="mr-1 text-foreground">•</span> : null}
                {tab.title}
              </span>
              {!tab.pinned ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose(tab.id)
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
      <AlertDialog
        open={pendingCloseId !== null}
        onOpenChange={(v) => {
          if (!v) setPendingCloseId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This plan tab has unsaved edits. Closing it will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCloseId) closeTab(pendingCloseId)
                setPendingCloseId(null)
              }}
            >
              Discard & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
