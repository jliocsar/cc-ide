import { useEffect, useState } from 'react'
import { GitBranch, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSidebarData } from '@/state/sidebar-data'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { WorktreeDTO } from '@shared/ipc'

const GUARD_LABEL: Record<string, string> = {
  'dirty-working-tree': 'Uncommitted changes',
  'unpushed-commits': 'Unpushed commits',
  'no-remote-tracking': 'No remote tracking branch',
  'primary-worktree': 'Primary worktree',
}

export function WorktreesSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const worktrees = useSidebarData((s) => s.worktrees)
  const status = useSidebarData((s) => s.worktreesStatus)
  const error = useSidebarData((s) => s.worktreesError)
  const refresh = useSidebarData((s) => s.refreshWorktrees)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void refresh(workspaceId)
  }, [workspaceId, refresh])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status === 'loading' ? 'loading…' : `${worktrees.length}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => void refresh(workspaceId)}
            aria-label="Refresh worktrees"
          >
            <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setCreateOpen(true)}
            aria-label="New worktree"
          >
            <Plus />
          </Button>
        </div>
      </div>
      {error ? <div className="px-2 py-1 font-mono text-[11px] text-destructive">{error}</div> : null}

      <div className="flex flex-col gap-px">
        {worktrees.map((w) => (
          <WorktreeRow key={w.path} workspaceId={workspaceId} worktree={w} />
        ))}
      </div>

      <CreateWorktreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </div>
  )
}

function WorktreeRow({ workspaceId, worktree }: { workspaceId: string; worktree: WorktreeDTO }): JSX.Element {
  const refresh = useSidebarData((s) => s.refreshWorktrees)
  const [guard, setGuard] = useState<{ ok: boolean; reasons: string[] } | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function probe() {
    const { guard } = await invoke('worktrees:canDelete', { worktree })
    setGuard(
      guard.ok
        ? { ok: true, reasons: [] }
        : { ok: false, reasons: guard.reasons },
    )
  }

  useEffect(() => {
    void probe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktree.path, worktree.head])

  async function onDelete() {
    if (!guard?.ok) return
    setDeleting(true)
    try {
      await invoke('worktrees:delete', { workspaceId, worktreePath: worktree.path })
      await refresh(workspaceId)
    } finally {
      setDeleting(false)
    }
  }

  const tip = guard?.ok
    ? 'Safe to delete'
    : guard
      ? `Cannot delete: ${guard.reasons.map((r) => GUARD_LABEL[r] ?? r).join(', ')}`
      : 'Checking…'

  return (
    <div className="group flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent/50">
      <GitBranch className="size-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-foreground">{worktree.branch ?? '(detached)'}</div>
        <div className="truncate text-[10px]">{worktree.path}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!guard?.ok || deleting}
            onClick={onDelete}
            className={cn(!guard?.ok && 'opacity-40')}
            aria-label="Delete worktree"
          >
            {guard?.ok ? <Trash2 /> : <AlertTriangle />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-[11px]">{tip}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function CreateWorktreeDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
}): JSX.Element {
  const refresh = useSidebarData((s) => s.refreshWorktrees)
  const [branch, setBranch] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [worktreePath, setWorktreePath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBranch('')
      setBaseBranch('')
      setWorktreePath('')
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (branch && !worktreePath) setWorktreePath(`../${branch}`)
  }, [branch, worktreePath])

  async function onSubmit() {
    if (submitting || !branch.trim() || !worktreePath.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await invoke('worktrees:create', {
        workspaceId,
        worktreePath: worktreePath.trim(),
        branch: branch.trim(),
        baseBranch: baseBranch.trim() || undefined,
      })
      await refresh(workspaceId)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New worktree</DialogTitle>
          <DialogDescription>
            Creates a new git worktree. Leave base blank to checkout an existing branch.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Branch</label>
            <Input
              autoFocus
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/foo"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">
              Base branch (optional) — creates a new branch from this base
            </label>
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Worktree path (relative to repo)</label>
            <Input
              value={worktreePath}
              onChange={(e) => setWorktreePath(e.target.value)}
              placeholder="../feature-foo"
            />
          </div>
          {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || !branch.trim() || !worktreePath.trim()}
          >
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
