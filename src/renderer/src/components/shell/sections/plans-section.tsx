import { validateFolderName, validateMarkdownFilename } from '@shared/markdown-name'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InlineRenameInput } from '@/components/ui/inline-rename-input'
import { Input } from '@/components/ui/input'
import { setDropPayload } from '@/lib/drop-payload'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { type PlanDir, type PlanNode, usePlansTree } from '@/state/plans-tree'
import { planTabId, useReviewComments } from '@/state/review-comments'
import { useSettings } from '@/state/settings'
import { useTabs } from '@/state/tabs'
import { useWorkspaces } from '@/state/workspaces'

const MOVE_MIME = 'application/x-cc-ide-plan-move'
const SPRING_EXPAND_MS = 600

type CreateRequest = { mode: 'file' | 'folder'; parent: string }

type OverwriteRequest = { fromRel: string; toRel: string }

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? rel : rel.slice(i + 1)
}

function joinRel(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function listChildren(parentRel: string): PlanNode[] {
  const root = usePlansTree.getState().root
  if (!root) return []
  if (parentRel === '') return root.children
  const stack: PlanNode[] = [...root.children]
  while (stack.length) {
    const n = stack.shift()!
    if (n.relPath === parentRel && n.kind === 'dir') return n.children
    if (n.kind === 'dir') stack.push(...n.children)
  }
  return []
}

function isDescendantMove(fromRel: string, toParentRel: string): boolean {
  return toParentRel === fromRel || toParentRel.startsWith(fromRel + '/')
}

function parentRelOf(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

function planAbsPath(workspaceId: string, relPath: string): string | null {
  const ws = useWorkspaces.getState().workspaces.find((w) => w.id === workspaceId)
  if (!ws) return null
  const dataRoot = useSettings.getState().settings.workspace?.dataRoot ?? '.cc-ide'
  return `${ws.path}/${dataRoot}/plans/${relPath}`
}

async function revealPlan(workspaceId: string, relPath: string): Promise<void> {
  const abs = planAbsPath(workspaceId, relPath)
  if (!abs) return
  await invoke('shell:showItemInFolder', { absolutePath: abs })
}

async function copyPlanPath(workspaceId: string, relPath: string): Promise<void> {
  const abs = planAbsPath(workspaceId, relPath)
  if (!abs) return
  await invoke('clipboard:write', { text: abs })
  toast.success('Copied path')
}

export function PlansSection({
  workspaceId,
  onCreateFromRow,
}: {
  workspaceId: string
  onCreateFromRow: (req: CreateRequest) => void
}): JSX.Element {
  const status = usePlansTree((s) => s.status)
  const root = usePlansTree((s) => s.root)
  const error = usePlansTree((s) => s.error)
  const load = usePlansTree((s) => s.load)
  const refresh = usePlansTree((s) => s.refresh)
  const rewriteExpanded = usePlansTree((s) => s.rewriteExpandedForMove)
  const rewriteTabs = useTabs((s) => s.rewritePlanTabsForMove)

  const [overwriteReq, setOverwriteReq] = useState<OverwriteRequest | null>(null)
  const [rootDragOver, setRootDragOver] = useState(false)

  useEffect(() => {
    void load(workspaceId)
  }, [workspaceId, load])

  async function doMove(fromRel: string, toRel: string, overwrite?: boolean): Promise<void> {
    try {
      await invoke('plans:rename', { workspaceId, fromRel, toRel, overwrite })
      rewriteExpanded(fromRel, toRel)
      rewriteTabs(workspaceId, fromRel, toRel)
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/already exists/.test(msg) && !overwrite) {
        setOverwriteReq({ fromRel, toRel })
        return
      }
      toast.error(msg)
    }
  }

  async function performMove(fromRel: string, toParentRel: string): Promise<void> {
    if (isDescendantMove(fromRel, toParentRel)) {
      toast.error('Cannot move a folder into itself or one of its descendants.')
      return
    }
    const name = basename(fromRel)
    const toRel = joinRel(toParentRel, name)
    if (toRel === fromRel) return
    const siblings = listChildren(toParentRel)
    const collision = siblings.some((c) => c.name === name && c.relPath !== fromRel)
    if (collision) {
      setOverwriteReq({ fromRel, toRel })
      return
    }
    await doMove(fromRel, toRel)
  }

  function onRootDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(MOVE_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setRootDragOver(true)
  }
  function onRootDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setRootDragOver(false)
  }
  function onRootDrop(e: React.DragEvent) {
    const fromRel = e.dataTransfer.getData(MOVE_MIME)
    setRootDragOver(false)
    if (!fromRel) return
    e.preventDefault()
    void performMove(fromRel, '')
  }

  return (
    <div
      className={cn('flex min-w-0 flex-col', rootDragOver && 'bg-accent/20')}
      onDragOver={onRootDragOver}
      onDragLeave={onRootDragLeave}
      onDrop={onRootDrop}
    >
      {error ? (
        <div className="px-3 py-1 font-mono text-[11px] text-destructive">{error}</div>
      ) : null}
      <div className="flex flex-col">
        {root && root.children.length > 0 ? (
          root.children.map((node) => (
            <PlanRow
              key={node.relPath}
              node={node}
              workspaceId={workspaceId}
              depth={0}
              onCreate={onCreateFromRow}
              performMove={performMove}
            />
          ))
        ) : status === 'ready' ? (
          <div className="px-3 py-1 font-mono text-[11px] text-muted-foreground">no plans</div>
        ) : null}
      </div>
      <AlertDialog open={!!overwriteReq} onOpenChange={(v) => !v && setOverwriteReq(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing plan?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono">{overwriteReq?.toRel}</code> already exists. Overwriting
              replaces it with the file you're moving. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverwriteReq(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const req = overwriteReq
                setOverwriteReq(null)
                if (req) void doMove(req.fromRel, req.toRel, true)
              }}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PlanRow({
  node,
  workspaceId,
  depth,
  onCreate,
  performMove,
}: {
  node: PlanNode
  workspaceId: string
  depth: number
  onCreate: (req: CreateRequest) => void
  performMove: (fromRel: string, toParentRel: string) => Promise<void>
}): JSX.Element {
  const expanded = usePlansTree((s) => s.expanded.has(node.relPath))
  const toggle = usePlansTree((s) => s.toggle)
  const setExpanded = usePlansTree((s) => s.setExpanded)
  const refresh = usePlansTree((s) => s.refresh)
  const openPlan = useTabs((s) => s.openPlan)
  const [renaming, setRenaming] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const springTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (springTimerRef.current) clearTimeout(springTimerRef.current)
    }
  }, [])

  const indent = { paddingLeft: 12 + depth * 12 }

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete ${node.relPath}? This cannot be undone.`)) return
    await invoke('plans:delete', { workspaceId, relPath: node.relPath })
    await refresh()
  }

  async function commitRename(nextName: string): Promise<void> {
    const trimmed = nextName.trim()
    if (!trimmed || trimmed === node.name) {
      setRenaming(false)
      return
    }
    const parent = node.relPath.includes('/')
      ? node.relPath.slice(0, node.relPath.lastIndexOf('/') + 1)
      : ''
    const target = parent + trimmed
    const siblings = listChildren(parent.replace(/\/$/, ''))
    if (siblings.some((s) => s.name === trimmed && s.relPath !== node.relPath)) {
      toast.error(
        `A ${siblings.find((s) => s.name === trimmed)?.kind ?? 'sibling'} named "${trimmed}" already exists.`,
      )
      setRenaming(false)
      return
    }
    try {
      await invoke('plans:rename', { workspaceId, fromRel: node.relPath, toRel: target })
      usePlansTree.getState().rewriteExpandedForMove(node.relPath, target)
      useTabs.getState().rewritePlanTabsForMove(workspaceId, node.relPath, target)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setRenaming(false)
  }

  if (node.kind === 'file') {
    return (
      <FileRow
        node={node}
        workspaceId={workspaceId}
        indent={indent}
        renaming={renaming}
        commitRename={commitRename}
        onRename={() => setRenaming(true)}
        cancelRename={() => setRenaming(false)}
        onDelete={onDelete}
        openPlan={openPlan}
        onCreate={onCreate}
      />
    )
  }

  function clearSpringTimer() {
    if (springTimerRef.current) {
      clearTimeout(springTimerRef.current)
      springTimerRef.current = null
    }
  }

  function onDragStart(e: React.DragEvent) {
    e.stopPropagation()
    e.dataTransfer.setData(MOVE_MIME, node.relPath)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(MOVE_MIME)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOver) setDragOver(true)
    if (!expanded && !springTimerRef.current) {
      springTimerRef.current = setTimeout(() => {
        setExpanded(node.relPath, true)
        springTimerRef.current = null
      }, SPRING_EXPAND_MS)
    }
  }
  function onDragLeave(_e: React.DragEvent) {
    setDragOver(false)
    clearSpringTimer()
  }
  function onDrop(e: React.DragEvent) {
    const fromRel = e.dataTransfer.getData(MOVE_MIME)
    setDragOver(false)
    clearSpringTimer()
    if (!fromRel) return
    e.preventDefault()
    e.stopPropagation()
    void performMove(fromRel, node.relPath)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            draggable={!renaming}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              'group flex items-center gap-1.5 py-0.5 pr-3 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              dragOver && 'bg-accent/60 ring-1 ring-inset ring-primary/50',
            )}
            style={indent}
          >
            <button
              type="button"
              onClick={() => toggle(node.relPath)}
              className="flex items-center gap-1.5"
            >
              {expanded ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <Folder className="size-3 shrink-0" />
            </button>
            {renaming ? (
              <InlineRenameInput
                className="flex-1"
                value={node.name}
                validate={validateFolderName}
                onCommit={commitRename}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => toggle(node.relPath)}
                className="min-w-0 flex-1 truncate text-left font-mono"
              >
                {node.name}
              </button>
            )}
            <RowActions
              onRename={() => setRenaming(true)}
              onDelete={onDelete}
              extras={
                <>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreate({ mode: 'file', parent: node.relPath })
                    }}
                    aria-label="New plan in folder"
                  >
                    <Plus />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreate({ mode: 'folder', parent: node.relPath })
                    }}
                    aria-label="New folder in folder"
                  >
                    <FolderPlus />
                  </Button>
                </>
              }
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onCreate({ mode: 'file', parent: node.relPath })}>
            <Plus />
            New plan
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCreate({ mode: 'folder', parent: node.relPath })}>
            <FolderPlus />
            New folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              if (
                !confirm(
                  `Delete folder "${node.relPath}" and all its contents? This cannot be undone.`,
                )
              )
                return
              void invoke('plans:delete', { workspaceId, relPath: node.relPath }).then(() =>
                refresh(),
              )
            }}
          >
            <Trash2 />
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void revealPlan(workspaceId, node.relPath)}>
            <FolderOpen />
            Reveal in Finder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyPlanPath(workspaceId, node.relPath)}>
            <Copy />
            Copy path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded
        ? (node as PlanDir).children.map((child) => (
            <PlanRow
              key={child.relPath}
              node={child}
              workspaceId={workspaceId}
              depth={depth + 1}
              onCreate={onCreate}
              performMove={performMove}
            />
          ))
        : null}
    </>
  )
}

function FileRow({
  node,
  workspaceId,
  indent,
  renaming,
  commitRename,
  onRename,
  cancelRename,
  onDelete,
  openPlan,
  onCreate,
}: {
  node: PlanNode & { kind: 'file' }
  workspaceId: string
  indent: React.CSSProperties
  renaming: boolean
  commitRename: (next: string) => Promise<void>
  onRename: () => void
  cancelRename: () => void
  onDelete: (e: React.MouseEvent) => void
  openPlan: (workspaceId: string, relPath: string) => void
  onCreate: (req: CreateRequest) => void
}): JSX.Element {
  const tabId = planTabId(workspaceId, node.relPath)
  const rangeCount = useReviewComments((s) => s.byTab[tabId]?.length ?? 0)
  const parent = parentRelOf(node.relPath)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable={!renaming}
          onDragStart={(e) => {
            setDropPayload(e.dataTransfer, { kind: 'plan', workspaceId, relPath: node.relPath })
            e.dataTransfer.setData(MOVE_MIME, node.relPath)
            e.dataTransfer.effectAllowed = 'copyMove'
          }}
          className="group flex items-center gap-1.5 py-0.5 pr-3 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          style={indent}
        >
          <FileText className="size-3 shrink-0" />
          {renaming ? (
            <InlineRenameInput
              className="flex-1"
              value={node.name}
              validate={validateMarkdownFilename}
              onCommit={commitRename}
              onCancel={cancelRename}
            />
          ) : (
            <button
              type="button"
              onClick={() => openPlan(workspaceId, node.relPath)}
              className="min-w-0 flex-1 truncate text-left font-mono"
            >
              {node.name}
            </button>
          )}
          {rangeCount > 0 ? (
            <span className="rounded bg-primary/20 px-1 font-mono text-[10px] text-primary">
              {rangeCount}
            </span>
          ) : null}
          <RowActions onRename={onRename} onDelete={onDelete} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCreate({ mode: 'file', parent })}>
          <Plus />
          New plan
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCreate({ mode: 'folder', parent })}>
          <FolderPlus />
          New folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDelete({ stopPropagation: () => {} } as unknown as React.MouseEvent)}
        >
          <Trash2 />
          Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void revealPlan(workspaceId, node.relPath)}>
          <FolderOpen />
          Reveal in Finder
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyPlanPath(workspaceId, node.relPath)}>
          <Copy />
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RowActions({
  onRename,
  onDelete,
  extras,
}: {
  onRename: () => void
  onDelete: (e: React.MouseEvent) => void
  extras?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {extras}
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation()
          onRename()
        }}
        aria-label="Rename"
      >
        <Pencil />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 />
      </Button>
    </div>
  )
}

export function PlanCreateDialog({
  open,
  request,
  onClose,
  workspaceId,
}: {
  open: boolean
  request: CreateRequest | null
  onClose: () => void
  workspaceId: string
}): JSX.Element {
  const refresh = usePlansTree((s) => s.refresh)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!request || busy) return
    const trimmed = name.trim()
    if (!trimmed) return
    const validation =
      request.mode === 'folder' ? validateFolderName(trimmed) : validateMarkdownFilename(trimmed)
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const target = request.parent ? `${request.parent}/${trimmed}` : trimmed
      if (request.mode === 'file') {
        await invoke('plans:create', { workspaceId, relPath: target })
      } else {
        await invoke('plans:createFolder', { workspaceId, relPath: target })
      }
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const label = request?.mode === 'folder' ? 'folder' : 'plan'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {label}</DialogTitle>
          <DialogDescription>
            {request?.parent ? (
              <>
                In <code className="font-mono">{request.parent}</code>
              </>
            ) : (
              'At root of plans tree'
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={request?.mode === 'folder' ? 'docs' : 'my-plan.md'}
          />
          {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
