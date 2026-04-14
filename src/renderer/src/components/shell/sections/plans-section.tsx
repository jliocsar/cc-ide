import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, Plus, FolderPlus, RefreshCw, Trash2, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invoke } from '@/lib/ipc'
import { usePlansTree, type PlanDir, type PlanNode } from '@/state/plans-tree'
import { useTabs } from '@/state/tabs'
import { useReviewComments, planTabId } from '@/state/review-comments'
import { setDropPayload } from '@/lib/drop-payload'
import { cn } from '@/lib/utils'

export function PlansSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const status = usePlansTree((s) => s.status)
  const root = usePlansTree((s) => s.root)
  const error = usePlansTree((s) => s.error)
  const load = usePlansTree((s) => s.load)
  const refresh = usePlansTree((s) => s.refresh)
  const [createOpen, setCreateOpen] = useState<null | { mode: 'file' | 'folder'; parent: string }>(null)

  useEffect(() => {
    void load(workspaceId)
  }, [workspaceId, load])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status === 'loading' ? 'loading…' : 'tree'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => void refresh()}
            aria-label="Refresh plans"
          >
            <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setCreateOpen({ mode: 'folder', parent: '' })}
            aria-label="New folder"
          >
            <FolderPlus />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setCreateOpen({ mode: 'file', parent: '' })}
            aria-label="New plan"
          >
            <Plus />
          </Button>
        </div>
      </div>

      {error ? <div className="px-2 py-1 font-mono text-[11px] text-destructive">{error}</div> : null}

      <div className="flex flex-col">
        {root && root.children.length > 0 ? (
          root.children.map((node) => (
            <PlanRow
              key={node.relPath}
              node={node}
              workspaceId={workspaceId}
              depth={0}
              onCreate={setCreateOpen}
            />
          ))
        ) : status === 'ready' ? (
          <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">no plans</div>
        ) : null}
      </div>

      <CreateDialog
        open={createOpen !== null}
        request={createOpen}
        onClose={() => setCreateOpen(null)}
        workspaceId={workspaceId}
      />
    </div>
  )
}

function PlanRow({
  node,
  workspaceId,
  depth,
  onCreate,
}: {
  node: PlanNode
  workspaceId: string
  depth: number
  onCreate: (req: { mode: 'file' | 'folder'; parent: string }) => void
}): JSX.Element {
  const expanded = usePlansTree((s) => s.expanded.has(node.relPath))
  const toggle = usePlansTree((s) => s.toggle)
  const refresh = usePlansTree((s) => s.refresh)
  const openPlan = useTabs((s) => s.openPlan)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)

  const indent = { paddingLeft: 6 + depth * 12 }

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete ${node.relPath}? This cannot be undone.`)) return
    await invoke('plans:delete', { workspaceId, relPath: node.relPath })
    await refresh()
  }

  async function commitRename(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = newName.trim()
    if (!trimmed || trimmed === node.name) {
      setRenaming(false)
      return
    }
    const parent = node.relPath.includes('/') ? node.relPath.slice(0, node.relPath.lastIndexOf('/') + 1) : ''
    const target = parent + trimmed
    try {
      await invoke('plans:rename', { workspaceId, fromRel: node.relPath, toRel: target })
      await refresh()
    } catch (err) {
      console.error('rename failed', err)
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
        newName={newName}
        setNewName={setNewName}
        commitRename={commitRename}
        onRename={() => {
          setNewName(node.name)
          setRenaming(true)
        }}
        onDelete={onDelete}
        openPlan={openPlan}
      />
    )
  }

  return (
    <>
      <div
        className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        style={indent}
      >
        <button
          type="button"
          onClick={() => toggle(node.relPath)}
          className="flex items-center gap-1.5"
        >
          {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
          <Folder className="size-3 shrink-0" />
        </button>
        {renaming ? (
          <form onSubmit={commitRename} className="flex-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={(e) => commitRename(e as unknown as React.FormEvent)}
              className="w-full bg-transparent font-mono text-[12px] outline-none"
            />
          </form>
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
          onRename={() => {
            setNewName(node.name)
            setRenaming(true)
          }}
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
      {expanded
        ? (node as PlanDir).children.map((child) => (
            <PlanRow
              key={child.relPath}
              node={child}
              workspaceId={workspaceId}
              depth={depth + 1}
              onCreate={onCreate}
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
  newName,
  setNewName,
  commitRename,
  onRename,
  onDelete,
  openPlan,
}: {
  node: PlanNode & { kind: 'file' }
  workspaceId: string
  indent: React.CSSProperties
  renaming: boolean
  newName: string
  setNewName: (v: string) => void
  commitRename: (e: React.FormEvent) => void
  onRename: () => void
  onDelete: (e: React.MouseEvent) => void
  openPlan: (workspaceId: string, relPath: string) => void
}): JSX.Element {
  const tabId = planTabId(workspaceId, node.relPath)
  const rangeCount = useReviewComments((s) => s.byTab[tabId]?.length ?? 0)

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => {
        setDropPayload(e.dataTransfer, { kind: 'plan', workspaceId, relPath: node.relPath })
      }}
      className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      style={indent}
    >
      <FileText className="size-3 shrink-0" />
      {renaming ? (
        <form onSubmit={commitRename} className="flex-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={(e) => commitRename(e as unknown as React.FormEvent)}
            className="w-full bg-transparent font-mono text-[12px] outline-none"
          />
        </form>
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
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function CreateDialog({
  open,
  request,
  onClose,
  workspaceId,
}: {
  open: boolean
  request: { mode: 'file' | 'folder'; parent: string } | null
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
            {request?.parent ? <>In <code className="font-mono">{request.parent}</code></> : 'At root of plans tree'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={request?.mode === 'folder' ? 'docs' : 'my-plan'}
          />
          {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
