import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

function run(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve_) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'], cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', () => resolve_({ code: -1, stdout, stderr: 'git not found' }))
    child.on('exit', (code) => resolve_({ code: code ?? -1, stdout, stderr }))
  })
}

export type Worktree = {
  path: string
  branch: string | null
  head: string
  isPrimary: boolean
  isBare: boolean
  isDetached: boolean
  isLocked: boolean
}

export type DeleteGuardReason =
  | 'dirty-working-tree'
  | 'unpushed-commits'
  | 'no-remote-tracking'
  | 'primary-worktree'

export type DeleteGuard = { ok: true } | { ok: false; reasons: DeleteGuardReason[] }

/**
 * Parses `git worktree list --porcelain` output into Worktree objects.
 * Each block is separated by an empty line.
 */
function parsePorcelain(raw: string): Worktree[] {
  const worktrees: Worktree[] = []
  const blocks = raw.trim().split(/\n\n/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.trim().split('\n')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isBare = false
    let isDetached = false
    let isLocked = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim()
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length).trim()
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim()
        // refs/heads/main → main
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'detached') {
        isDetached = true
      } else if (line.startsWith('locked')) {
        isLocked = true
      }
    }

    worktrees.push({ path, head, branch, isPrimary: false, isBare, isDetached, isLocked })
  }

  // First entry is always the main worktree
  if (worktrees[0]) {
    worktrees[0].isPrimary = true
  }

  return worktrees
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const r = await run(['worktree', 'list', '--porcelain'], repoPath)
  if (r.code !== 0) throw new Error(`git worktree list failed: ${r.stderr.trim()}`)
  return parsePorcelain(r.stdout)
}

export async function createWorktree(options: {
  repoPath: string
  worktreePath: string
  branch: string
  baseBranch?: string
}): Promise<Worktree> {
  const { repoPath, branch, baseBranch } = options
  const worktreePath = resolve(repoPath, options.worktreePath)

  const args = baseBranch
    ? ['worktree', 'add', '-b', branch, worktreePath, baseBranch]
    : ['worktree', 'add', worktreePath, branch]

  const r = await run(args, repoPath)
  if (r.code !== 0) throw new Error(`git worktree add failed: ${r.stderr.trim()}`)

  const all = await listWorktrees(repoPath)
  const created = all.find((w) => w.path === worktreePath)
  if (!created) throw new Error(`worktree created but not found in list: ${worktreePath}`)
  return created
}

export async function canDeleteWorktree(worktree: Worktree): Promise<DeleteGuard> {
  const reasons: DeleteGuardReason[] = []

  if (worktree.isPrimary) {
    reasons.push('primary-worktree')
    // Skip further checks — they'd be misleading or error-prone for primary
    return { ok: false, reasons }
  }

  // dirty-working-tree: any output from `git status --porcelain`
  const statusR = await run(['status', '--porcelain'], worktree.path)
  if (statusR.code !== 0) {
    // Can't determine — conservative: treat as dirty
    reasons.push('dirty-working-tree')
  } else if (statusR.stdout.trim().length > 0) {
    reasons.push('dirty-working-tree')
  }

  // no-remote-tracking and unpushed-commits require a branch
  if (worktree.isDetached || worktree.branch === null) {
    // Detached HEAD → can't check upstream → treat as unsafe
    reasons.push('no-remote-tracking')
  } else {
    // Check upstream config
    const upstreamR = await run(
      ['rev-parse', '--abbrev-ref', `${worktree.branch}@{u}`],
      worktree.path,
    )

    if (upstreamR.code !== 0) {
      reasons.push('no-remote-tracking')
    } else {
      // upstream exists — check for unpushed commits
      const countR = await run(
        ['rev-list', '--count', `origin/${worktree.branch}..HEAD`],
        worktree.path,
      )

      if (countR.code !== 0) {
        // origin/<branch> ref doesn't exist — treat as unpushed
        reasons.push('unpushed-commits')
      } else {
        const count = parseInt(countR.stdout.trim(), 10)
        if (!isNaN(count) && count > 0) {
          reasons.push('unpushed-commits')
        }
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons }
  return { ok: true }
}

export async function deleteWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const r = await run(['worktree', 'remove', worktreePath], repoPath)
  if (r.code !== 0) throw new Error(`git worktree remove failed: ${r.stderr.trim()}`)
}

/**
 * "Untouched" = clean working tree AND HEAD === base (no commits ahead).
 * Used by the ephemeral-worktree cleanup path: if either is false, the worktree
 * is kept (the user did something worth preserving).
 */
export async function isWorktreeUntouched(
  worktreePath: string,
  base: string,
): Promise<boolean> {
  const status = await run(['status', '--porcelain'], worktreePath)
  if (status.code !== 0) return false
  if (status.stdout.trim().length > 0) return false
  const ahead = await run(['rev-list', '--count', `${base}..HEAD`], worktreePath)
  if (ahead.code !== 0) return false
  const n = parseInt(ahead.stdout.trim(), 10)
  return !isNaN(n) && n === 0
}

/** Safe branch delete: `-d` refuses if unmerged. Returns true on success. */
export async function deleteBranchIfMerged(repoPath: string, branch: string): Promise<boolean> {
  const r = await run(['branch', '-d', branch], repoPath)
  return r.code === 0
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const r = await run(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], repoPath)
  if (r.code !== 0) throw new Error(`git for-each-ref failed: ${r.stderr.trim()}`)
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export async function currentBranch(repoPath: string): Promise<string | null> {
  const r = await run(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  if (r.code !== 0) return null
  const b = r.stdout.trim()
  return b === 'HEAD' ? null : b
}
