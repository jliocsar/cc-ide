import { validateTmuxWindowName } from '@shared/tmux-name'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react'
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSpawnSession } from '@/hooks/use-spawn-session'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { PromptFile, PromptNode } from '@/state/prompts-tree'
import { usePromptsTree } from '@/state/prompts-tree'
import type { SpawnFlags, SpawnWorktreeOption } from '@/state/sessions'
import {
  type EnvVarRow,
  getEnvVarsForWorkspace,
  getLastUsedWorktree,
  setEnvVarsForWorkspace,
  setLastUsedWorktree,
  useSpawnModal,
} from '@/state/spawn-modal'
import { useWorkspaces } from '@/state/workspaces'

type ExistingWorktree = { path: string; branch: string | null; isPrimary: boolean }

type Choice = { kind: 'primary' } | { kind: 'existing'; path: string } | { kind: 'new' }

const PROMPT_MAX_BYTES = 100 * 1024
const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

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

function flattenPromptFiles(node: PromptNode | null): PromptFile[] {
  if (!node) return []
  if (node.kind === 'file') return [node]
  const out: PromptFile[] = []
  for (const c of node.children) out.push(...flattenPromptFiles(c))
  return out
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
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

  const [initialPrompt, setInitialPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bypassPermissions, setBypassPermissions] = useState(false)
  const [envRows, setEnvRows] = useState<(EnvVarRow & { id: string })[]>([])

  const promptsRoot = usePromptsTree((s) => s.root)
  const promptFiles = useMemo(
    () => flattenPromptFiles(promptsRoot).sort((a, b) => a.relPath.localeCompare(b.relPath)),
    [promptsRoot],
  )

  const trimmedCustomName = customName.trim()
  const nameValidation = trimmedCustomName === '' ? null : validateTmuxWindowName(trimmedCustomName)
  const nameInvalid = nameValidation !== null && !nameValidation.ok

  const promptByteLength = useMemo(() => utf8ByteLength(initialPrompt), [initialPrompt])
  const promptTooLong = promptByteLength > PROMPT_MAX_BYTES

  const envValidation = useMemo(() => validateEnvRows(envRows), [envRows])

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
        setInitialPrompt('')
        setBypassPermissions(false)
        setShowAdvanced(false)
        const persisted = getEnvVarsForWorkspace(workspaceId)
        setEnvRows(
          persisted.length > 0 ? persisted.map((r) => ({ ...r, id: crypto.randomUUID() })) : [],
        )
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, workspaceId])

  const sortedWorktrees = useMemo(() => {
    const filtered: typeof worktrees = []
    for (const w of worktrees) if (!w.isPrimary) filtered.push(w)
    return filtered.sort((a, b) => a.path.localeCompare(b.path))
  }, [worktrees])

  function addEnvRow() {
    setEnvRows((rows) => [...rows, { id: crypto.randomUUID(), key: '', value: '' }])
  }

  function updateEnvRow(id: string, patch: Partial<EnvVarRow>) {
    setEnvRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeEnvRow(id: string) {
    setEnvRows((rows) => rows.filter((r) => r.id !== id))
  }

  async function onPickPrompt(relPath: string) {
    if (!workspaceId || !relPath) return
    try {
      const { content } = await invoke('prompts:read', { workspaceId, relPath })
      setInitialPrompt(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

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
    if (promptTooLong) {
      setError(`Prompt is too long (${promptByteLength} bytes; cap is ${PROMPT_MAX_BYTES}).`)
      return
    }
    if (!envValidation.ok) {
      setError(envValidation.reason)
      return
    }
    setError(null)

    const trimmedPrompt = initialPrompt.trim()
    const flags: SpawnFlags = {}
    if (bypassPermissions) flags.bypassPermissions = true
    if (trimmedPrompt) flags.initialPromptBase64 = toBase64Utf8(initialPrompt)
    const envVars = collectEnvVars(envRows)
    if (Object.keys(envVars).length > 0) flags.envVars = envVars

    try {
      await spawn(
        viewportPos ?? undefined,
        option,
        trimmedCustomName === '' ? undefined : trimmedCustomName,
        Object.keys(flags).length > 0 ? flags : undefined,
      )
      setLastUsedWorktree(workspaceId, option)
      setEnvVarsForWorkspace(
        workspaceId,
        envRows
          .filter((r) => r.key.trim() !== '')
          .map((r) => ({ key: r.key.trim(), value: r.value })),
      )
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Claude session</DialogTitle>
          <DialogDescription>Pick where this Claude instance runs.</DialogDescription>
        </DialogHeader>

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

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Where</span>
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
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Branch name
                <Input
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
                    <SelectGroup>
                      {branches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Initial Prompt
            </span>
            {promptFiles.length > 0 ? (
              <Select
                value=""
                onValueChange={(v) => {
                  void onPickPrompt(v)
                }}
              >
                <SelectTrigger className="h-7 w-auto text-[11px]">
                  <SelectValue placeholder="From saved prompt…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {promptFiles.map((p) => (
                      <SelectItem key={p.relPath} value={p.relPath}>
                        {p.relPath}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <Textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="(empty — opens claude with no initial prompt)"
            className={cn('min-h-24 font-mono text-xs', promptTooLong && 'border-destructive')}
          />
          {promptTooLong ? (
            <span className="font-mono text-[10px] text-destructive">
              Prompt is too long ({promptByteLength.toLocaleString()} bytes; cap is{' '}
              {PROMPT_MAX_BYTES.toLocaleString()}).
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Advanced
        </button>

        {showAdvanced ? (
          <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={bypassPermissions}
                onClick={() => setBypassPermissions((v) => !v)}
                className={cn(
                  'mt-px inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors',
                  bypassPermissions
                    ? 'border-destructive bg-destructive/30'
                    : 'border-border bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3 w-3 rounded-full transition-transform',
                    bypassPermissions
                      ? 'translate-x-3 bg-destructive'
                      : 'translate-x-0.5 bg-foreground/60',
                  )}
                />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn('font-mono text-[11px]', bypassPermissions && 'text-destructive')}
                  >
                    Bypass Permissions
                  </span>
                  <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
                    --dangerously-skip-permissions
                  </code>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle
                        className={cn(
                          'size-3',
                          bypassPermissions ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      Skips Claude&apos;s tool-permission prompts. The session can read/write/run
                      anything in your home dir without asking. Use only in trusted environments.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Extra env vars
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  remembered for this workspace
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {envRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => updateEnvRow(row.id, { key: e.target.value })}
                      placeholder="KEY"
                      className="h-8 w-32 font-mono text-xs"
                    />
                    <span className="text-muted-foreground">=</span>
                    <EnvValueInput
                      value={row.value}
                      onChange={(v) => updateEnvRow(row.id, { value: v })}
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeEnvRow(row.id)}
                      aria-label="Remove env var"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={addEnvRow} className="self-start">
                  <Plus />
                  Add env var
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="font-mono text-[11px] text-destructive">{error}</div> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={onSpawn} disabled={spawning || nameInvalid || promptTooLong}>
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

const VAR_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g

function EnvValueInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const segments = useMemo(() => splitVarSegments(value), [value])
  const hasVar = segments.some((s) => s.kind === 'var')
  return (
    <div className="relative flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre rounded-md border border-transparent px-3 font-mono text-xs"
      >
        {segments.map((seg, i) =>
          seg.kind === 'var' ? (
            <span
              key={i}
              className="rounded-sm border border-primary/30 bg-primary/15 px-1 text-primary"
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="value (use $VAR for shell expansion)"
        className="h-8 w-full bg-transparent font-mono text-xs"
        style={{
          color: hasVar ? 'transparent' : undefined,
          caretColor: 'var(--foreground)',
        }}
      />
    </div>
  )
}

type Segment = { kind: 'text' | 'var'; text: string }

function splitVarSegments(value: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  VAR_RE.lastIndex = 0
  let m = VAR_RE.exec(value)
  while (m !== null) {
    if (m.index > last) out.push({ kind: 'text', text: value.slice(last, m.index) })
    out.push({ kind: 'var', text: m[0] })
    last = m.index + m[0].length
    m = VAR_RE.exec(value)
  }
  if (last < value.length) out.push({ kind: 'text', text: value.slice(last) })
  return out
}

function validateEnvRows(rows: EnvVarRow[]): { ok: true } | { ok: false; reason: string } {
  const seen = new Set<string>()
  for (const row of rows) {
    const k = row.key.trim()
    if (k === '') continue
    if (!ENV_VAR_NAME_RE.test(k)) {
      return { ok: false, reason: `Invalid env var name "${k}".` }
    }
    if (seen.has(k)) {
      return { ok: false, reason: `Duplicate env var name "${k}".` }
    }
    seen.add(k)
  }
  return { ok: true }
}

function collectEnvVars(rows: EnvVarRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const k = row.key.trim()
    if (k === '') continue
    out[k] = row.value
  }
  return out
}
