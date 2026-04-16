import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown, FileText, Folder, Plus, FolderPlus, Trash2, Pencil } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { invoke } from '@/lib/ipc'
import { usePromptsTree, type PromptDir, type PromptNode } from '@/state/prompts-tree'
import { useTabs } from '@/state/tabs'
import { setDropPayload } from '@/lib/drop-payload'

const MOVE_MIME = 'application/x-cc-ide-prompt-move'
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

function listChildren(parentRel: string): PromptNode[] {
  const root = usePromptsTree.getState().root
  if (!root) return []
  if (parentRel === '') return root.children
  const stack: PromptNode[] = [...root.children]
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

export function PromptsSection({
  workspaceId,
  onCreateFromRow,
}: {
  workspaceId: string
  onCreateFromRow: (req: CreateRequest) => void
}): JSX.Element {
  const status = usePromptsTree((s) => s.status)
  const root = usePromptsTree((s) => s.root)
  const error = usePromptsTree((s) => s.error)
  const load = usePromptsTree((s) => s.load)
  const refresh = usePromptsTree((s) => s.refresh)
  const rewriteExpanded = usePromptsTree((s) => s.rewriteExpandedForMove)
  const rewriteTabs = useTabs((s) => s.rewritePromptTabsForMove)

  const [overwriteReq, setOverwriteReq] = useState<OverwriteRequest | null>(null)
  const [rootDragOver, setRootDragOver] = useState(false)

  useEffect(() => {
    void load(workspaceId)
  }, [workspaceId, load])

  async function doMove(fromRel: string, toRel: string, overwrite?: boolean): Promise<void> {
    try {
      await invoke('prompts:rename', { workspaceId, fromRel, toRel, overwrite })
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
      {error ? <div className="px-3 py-1 font-mono text-[11px] text-destructive">{error}</div> : null}
      <div className="flex flex-col">
        {root && root.children.length > 0 ? (
          root.children.map((node) => (
            <PromptRow
              key={node.relPath}
              node={node}
              workspaceId={workspaceId}
              depth={0}
              onCreate={onCreateFromRow}
              performMove={performMove}
            />
          ))
        ) : status === 'ready' ? (
          <div className="px-3 py-1 font-mono text-[11px] text-muted-foreground">no prompts</div>
        ) : null}
      </div>
      <AlertDialog open={!!overwriteReq} onOpenChange={(v) => !v && setOverwriteReq(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing prompt?</AlertDialogTitle>
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

function PromptRow({
  node,
  workspaceId,
  depth,
  onCreate,
  performMove,
}: {
  node: PromptNode
  workspaceId: string
  depth: number
  onCreate: (req: CreateRequest) => void
  performMove: (fromRel: string, toParentRel: string) => Promise<void>
}): JSX.Element {
  const expanded = usePromptsTree((s) => s.expanded.has(node.relPath))
  const toggle = usePromptsTree((s) => s.toggle)
  const setExpanded = usePromptsTree((s) => s.setExpanded)
  const refresh = usePromptsTree((s) => s.refresh)
  const openPrompt = useTabs((s) => s.openPrompt)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
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
    await invoke('prompts:delete', { workspaceId, relPath: node.relPath })
    await refresh()
  }

  async function commitRename(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = newName.trim().replace(/\//g, '')
    if (!trimmed || trimmed === node.name) {
      setRenaming(false)
      return
    }
    const parent = node.relPath.includes('/') ? node.relPath.slice(0, node.relPath.lastIndexOf('/') + 1) : ''
    const target = parent + trimmed
    const siblings = listChildren(parent.replace(/\/$/, ''))
    if (siblings.some((s) => s.name === trimmed && s.relPath !== node.relPath)) {
      toast.error(`A ${siblings.find((s) => s.name === trimmed)?.kind ?? 'sibling'} named "${trimmed}" already exists.`)
      setRenaming(false)
      return
    }
    try {
      await invoke('prompts:rename', { workspaceId, fromRel: node.relPath, toRel: target })
      usePromptsTree.getState().rewriteExpandedForMove(node.relPath, target)
      useTabs.getState().rewritePromptTabsForMove(workspaceId, node.relPath, target)
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
        newName={newName}
        setNewName={setNewName}
        commitRename={commitRename}
        onRename={() => {
          setNewName(node.name)
          setRenaming(true)
        }}
        onDelete={onDelete}
        openPrompt={openPrompt}
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
                aria-label="New prompt in folder"
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
        ? (node as PromptDir).children.map((child) => (
            <PromptRow
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
  newName,
  setNewName,
  commitRename,
  onRename,
  onDelete,
  openPrompt,
}: {
  node: PromptNode & { kind: 'file' }
  workspaceId: string
  indent: React.CSSProperties
  renaming: boolean
  newName: string
  setNewName: (v: string) => void
  commitRename: (e: React.FormEvent) => void
  onRename: () => void
  onDelete: (e: React.MouseEvent) => void
  openPrompt: (workspaceId: string, relPath: string) => void
}): JSX.Element {
  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => {
        setDropPayload(e.dataTransfer, { kind: 'prompt', workspaceId, relPath: node.relPath })
        e.dataTransfer.setData(MOVE_MIME, node.relPath)
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      className="group flex items-center gap-1.5 py-0.5 pr-3 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
          onClick={() => openPrompt(workspaceId, node.relPath)}
          className="min-w-0 flex-1 truncate text-left font-mono"
        >
          {node.name}
        </button>
      )}
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

export function PromptCreateDialog({
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
  const refresh = usePromptsTree((s) => s.refresh)
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
    const trimmed = name.trim().replace(/\//g, '')
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const target = request.parent ? `${request.parent}/${trimmed}` : trimmed
      if (request.mode === 'file') {
        await invoke('prompts:create', { workspaceId, relPath: target })
      } else {
        await invoke('prompts:createFolder', { workspaceId, relPath: target })
      }
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const label = request?.mode === 'folder' ? 'folder' : 'prompt'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {label}</DialogTitle>
          <DialogDescription>
            {request?.parent ? <>In <code className="font-mono">{request.parent}</code></> : 'At root of prompts tree'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={request?.mode === 'folder' ? 'templates' : 'my-prompt'}
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
