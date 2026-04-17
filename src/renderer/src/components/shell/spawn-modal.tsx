import { validateTmuxWindowName } from '@shared/tmux-name'
import { FolderGit2, GitBranch, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSpawnSession } from '@/hooks/use-spawn-session'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { SpawnWorktreeOption } from '@/state/sessions'
import { getLastUsedWorktree, setLastUsedWorktree, useSpawnModal } from '@/state/spawn-modal'
import { useWorkspaces } from '@/state/workspaces'

type ExistingWorktree = { path: string; branch: string | null; isPrimary: boolean }

type Choice = { kind: 'primary' } | { kind: 'existing'; path: string } | { kind: 'new' }

function sameChoice(a: Choice, b: Choice): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'existing' && b.kind === 'existing') return a.path === b.path
  return true
}

function choiceFromLastUsed(last: SpawnWorktreeOption | null): Choice {
  if (!last) return { kind: 'primary' }
  if (last.kind === 'primary') return { kind: 'primary' }
  if (last.kind === 'existing') return { kind: 'existing', path: last.path }
  return { kind: 'primary' }
}

export function SpawnModal(): JSX.Element {
  const isOpen = useSpawnModal((s) => s.isOpen)
  const close = useSpawnModal((s) => s.close)
  const viewportPos = useSpawnModal((s) => s.viewportPos)
  const workspaceId = useWorkspaces((s) => s.activeId)
  const { spawn, spawning } = useSpawnSession()

  const [worktrees, setWorktrees] = useState<ExistingWorktree[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice>({ kind: 'primary' })
  const [newBranch, setNewBranch] = useState('')
  const [baseBranch, setBaseBranch] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const trimmedCustomName = customName.trim()
  const nameValidation = trimmedCustomName === '' ? null : validateTmuxWindowName(trimmedCustomName)
  const nameInvalid = nameValidation !== null && !nameValidation.ok

  // Load worktrees + branches every open.
  useEffect(() => {
    if (!isOpen || !workspaceId) return
    let cancelled = false
    void (async () => {
      try {
        const [w, g] = await Promise.all([
          invoke('worktrees:listNonEphemeral', { workspaceId }),
          invoke('git:listBranches', { workspaceId }),
        ])
        if (cancelled) return
        setWorktrees(w.worktrees)
        setBranches(g.branches)
        setCurrentBranch(g.current)
        const last = getLastUsedWorktree(workspaceId)
        const initial = choiceFromLastUsed(last)
        const exists =
          initial.kind !== 'existing' || w.worktrees.some((wt) => wt.path === initial.path)
        setChoice(exists ? initial : { kind: 'primary' })
        setNewBranch('')
        setBaseBranch(g.current ?? g.branches[0] ?? null)
        setCustomName('')
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, workspaceId])

  const sortedWorktrees = useMemo(
    () => [...worktrees].filter((w) => !w.isPrimary).sort((a, b) => a.path.localeCompare(b.path)),
    [worktrees],
  )

  async function onSpawn(): Promise<void> {
    if (!workspaceId) return
    let option: SpawnWorktreeOption
    if (choice.kind === 'primary') option = { kind: 'primary' }
    else if (choice.kind === 'existing') option = { kind: 'existing', path: choice.path }
    else {
      const branch = newBranch.trim()
      if (!branch) {
        setError('Branch name is required.')
        return
      }
      if (branches.includes(branch)) {
        setError(`Branch "${branch}" already exists.`)
        return
      }
      if (!baseBranch) {
        setError('Pick a base branch.')
        return
      }
      option = { kind: 'new', branch, base: baseBranch }
    }
    if (nameInvalid) {
      setError((nameValidation as { ok: false; reason: string }).reason)
      return
    }
    setError(null)
    try {
      await spawn(
        viewportPos ?? undefined,
        option,
        trimmedCustomName === '' ? undefined : trimmedCustomName,
      )
      setLastUsedWorktree(workspaceId, option)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Claude session</DialogTitle>
          <DialogDescription>Pick where this Claude instance runs.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <ChoiceRow
            icon={FolderGit2}
            label="Primary repo"
            sublabel={currentBranch ? `branch: ${currentBranch}` : undefined}
            selected={choice.kind === 'primary'}
            onSelect={() => setChoice({ kind: 'primary' })}
          />
          {sortedWorktrees.map((w) => (
            <ChoiceRow
              key={w.path}
              icon={GitBranch}
              label={w.path.split('/').slice(-2).join('/')}
              sublabel={w.branch ? `branch: ${w.branch}` : 'detached'}
              selected={sameChoice(choice, { kind: 'existing', path: w.path })}
              onSelect={() => setChoice({ kind: 'existing', path: w.path })}
            />
          ))}
          <ChoiceRow
            icon={Plus}
            label="New worktree…"
            selected={choice.kind === 'new'}
            onSelect={() => setChoice({ kind: 'new' })}
          />
          {choice.kind === 'new' ? (
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Branch name
                <Input
                  autoFocus
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="feat/something"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Base branch
                <Select value={baseBranch ?? undefined} onValueChange={(v) => setBaseBranch(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          ) : null}
        </div>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Session name (optional)
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="claude-oreo (auto)"
            className={cn(
              'font-mono',
              nameInvalid && 'border-destructive focus-visible:ring-destructive',
            )}
          />
          {nameInvalid ? (
            <span className="font-mono text-[10px] text-destructive">
              {(nameValidation as { ok: false; reason: string }).reason}
            </span>
          ) : null}
        </label>
        {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={onSpawn} disabled={spawning || nameInvalid}>
            {spawning ? 'Spawning…' : 'Spawn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChoiceRow({
  icon: Icon,
  label,
  sublabel,
  selected,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel?: string
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-[12px] hover:bg-accent/40',
        selected && 'border-primary/40 bg-primary/10',
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono">{label}</span>
        {sublabel ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>
    </button>
  )
}
