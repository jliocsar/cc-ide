import type { WorktreeDTO } from '@shared/ipc'
import { AlertTriangle, GitBranch, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useSidebarData } from '@/state/sidebar-data'
import { useWorkspaces } from '@/state/workspaces'

const GUARD_LABEL: Record<string, string> = {
  'dirty-working-tree': 'Uncommitted changes',
  'unpushed-commits': 'Unpushed commits',
  'no-remote-tracking': 'No remote tracking branch',
  'primary-worktree': 'Primary worktree',
}

export function WorktreesSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const worktrees = useSidebarData((s) => s.worktrees)
  const error = useSidebarData((s) => s.worktreesError)

  return (
    <div className="flex min-w-0 flex-col">
      {error ? (
        <div className="px-3 py-1 font-mono text-[11px] text-destructive">{error}</div>
      ) : null}
      <div className="flex flex-col">
        {worktrees.map((w) => (
          <WorktreeRow key={w.path} workspaceId={workspaceId} worktree={w} />
        ))}
      </div>
    </div>
  )
}

function WorktreeRow({
  workspaceId,
  worktree,
}: {
  workspaceId: string
  worktree: WorktreeDTO
}): JSX.Element {
  const refresh = useSidebarData((s) => s.refreshWorktrees)
  const workspacePath = useWorkspaces(
    (s) => s.workspaces.find((w) => w.id === workspaceId)?.path ?? '',
  )
  const [guard, setGuard] = useState<{ ok: boolean; reasons: string[] } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const displayPath = relativeToWorkspace(worktree.path, workspacePath)

  async function probe() {
    const { guard } = await invoke('worktrees:canDelete', { worktree })
    setGuard(guard.ok ? { ok: true, reasons: [] } : { ok: false, reasons: guard.reasons })
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
    <div className="group flex min-w-0 items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
      <GitBranch className="size-3 shrink-0" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate font-mono">{worktree.branch ?? '(detached)'}</div>
        <div className="truncate text-[10px] text-muted-foreground/60" title={worktree.path}>
          {displayPath}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!guard?.ok || deleting}
            onClick={onDelete}
            className={cn('shrink-0', !guard?.ok && 'opacity-40')}
            aria-label="Delete worktree"
          >
            {guard?.ok ? <Trash2 /> : <AlertTriangle />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-[11px]">
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function relativeToWorkspace(abs: string, workspacePath: string): string {
  if (!workspacePath) return abs
  const normalized = workspacePath.endsWith('/') ? workspacePath.slice(0, -1) : workspacePath
  if (abs === normalized) return '.'
  if (abs.startsWith(normalized + '/')) return abs.slice(normalized.length + 1)
  return abs
}

export function CreateWorktreeDialog({
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
            <label className="text-[11px] text-muted-foreground">
              Worktree path (relative to repo)
            </label>
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
