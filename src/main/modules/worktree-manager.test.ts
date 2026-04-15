import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  listWorktrees,
  createWorktree,
  canDeleteWorktree,
  deleteWorktree,
  isWorktreeUntouched,
  deleteBranchIfMerged,
  listLocalBranches,
  currentBranch,
} from './worktree-manager'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'], cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', () => resolve({ code: -1, stdout, stderr: 'git not found' }))
    child.on('exit', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

async function gitOrThrow(args: string[], cwd: string): Promise<string> {
  const r = await git(args, cwd)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return r.stdout.trim()
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let repoDir: string
let remoteDir: string

beforeEach(async () => {
  // main repo
  repoDir = await mkdtemp(join(tmpdir(), 'cc-ide-wt-'))
  // bare remote
  remoteDir = await mkdtemp(join(tmpdir(), 'cc-ide-remote-'))

  // init main repo
  await gitOrThrow(['init', '-b', 'main'], repoDir)
  await gitOrThrow(['config', 'user.email', 'test@cc-ide.local'], repoDir)
  await gitOrThrow(['config', 'user.name', 'CC IDE Test'], repoDir)

  // initial commit
  await writeFile(join(repoDir, 'README.md'), '# cc-ide test repo\n')
  await gitOrThrow(['add', 'README.md'], repoDir)
  await gitOrThrow(['commit', '-m', 'init'], repoDir)

  // bare remote
  await gitOrThrow(['init', '--bare', '-b', 'main'], remoteDir)
  await gitOrThrow(['remote', 'add', 'origin', remoteDir], repoDir)
  await gitOrThrow(['push', '-u', 'origin', 'main'], repoDir)
})

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true })
  await rm(remoteDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listWorktrees', () => {
  it('returns primary only after git init', async () => {
    const worktrees = await listWorktrees(repoDir)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0]?.isPrimary).toBe(true)
    expect(worktrees[0]?.branch).toBe('main')
    expect(worktrees[0]?.path).toBe(repoDir)
  })
})

describe('createWorktree', () => {
  it('with existing branch adds a worktree — listing shows two', async () => {
    // create a branch first
    await gitOrThrow(['branch', 'feat/a'], repoDir)

    const wtPath = join(repoDir, 'wt-feat-a')
    const wt = await createWorktree({
      repoPath: repoDir,
      worktreePath: wtPath,
      branch: 'feat/a',
    })

    expect(wt.branch).toBe('feat/a')
    expect(wt.isPrimary).toBe(false)

    const all = await listWorktrees(repoDir)
    expect(all).toHaveLength(2)
  })

  it('with baseBranch creates a new branch at that base', async () => {
    const wtPath = join(repoDir, 'wt-feat-b')
    const wt = await createWorktree({
      repoPath: repoDir,
      worktreePath: wtPath,
      branch: 'feat/b',
      baseBranch: 'main',
    })

    expect(wt.branch).toBe('feat/b')
    expect(wt.isPrimary).toBe(false)

    const all = await listWorktrees(repoDir)
    expect(all).toHaveLength(2)
  })
})

describe('canDeleteWorktree', () => {
  it('returns primary-worktree reason for the main worktree', async () => {
    const [primary] = await listWorktrees(repoDir)
    if (!primary) throw new Error('no primary')

    const guard = await canDeleteWorktree(primary)
    expect(guard.ok).toBe(false)
    if (!guard.ok) {
      expect(guard.reasons).toContain('primary-worktree')
    }
  })

  it('clean worktree with remote tracking + no unpushed → ok: true', async () => {
    const wtPath = join(repoDir, 'wt-clean')
    await createWorktree({ repoPath: repoDir, worktreePath: wtPath, branch: 'feat/clean', baseBranch: 'main' })
    await gitOrThrow(['config', 'user.email', 'test@cc-ide.local'], wtPath)
    await gitOrThrow(['config', 'user.name', 'CC IDE Test'], wtPath)

    // push the new branch so upstream exists
    await gitOrThrow(['push', '-u', 'origin', 'feat/clean'], wtPath)

    const all = await listWorktrees(repoDir)
    const wt = all.find((w) => !w.isPrimary)
    if (!wt) throw new Error('no secondary worktree')

    const guard = await canDeleteWorktree(wt)
    expect(guard.ok).toBe(true)
  })

  it('dirty worktree → reasons includes dirty-working-tree', async () => {
    const wtPath = join(repoDir, 'wt-dirty')
    await createWorktree({ repoPath: repoDir, worktreePath: wtPath, branch: 'feat/dirty', baseBranch: 'main' })
    await gitOrThrow(['push', '-u', 'origin', 'feat/dirty'], wtPath)

    // make it dirty (untracked file is enough for --porcelain)
    await writeFile(join(wtPath, 'dirty.txt'), 'uncommitted\n')

    const all = await listWorktrees(repoDir)
    const wt = all.find((w) => !w.isPrimary)
    if (!wt) throw new Error('no secondary worktree')

    const guard = await canDeleteWorktree(wt)
    expect(guard.ok).toBe(false)
    if (!guard.ok) {
      expect(guard.reasons).toContain('dirty-working-tree')
    }
  })

  it('unpushed commits → reasons includes unpushed-commits', async () => {
    const wtPath = join(repoDir, 'wt-unpushed')
    await createWorktree({ repoPath: repoDir, worktreePath: wtPath, branch: 'feat/unpushed', baseBranch: 'main' })
    await gitOrThrow(['config', 'user.email', 'test@cc-ide.local'], wtPath)
    await gitOrThrow(['config', 'user.name', 'CC IDE Test'], wtPath)
    await gitOrThrow(['push', '-u', 'origin', 'feat/unpushed'], wtPath)

    // commit something without pushing
    await writeFile(join(wtPath, 'new.txt'), 'content\n')
    await gitOrThrow(['add', 'new.txt'], wtPath)
    await gitOrThrow(['commit', '-m', 'unpushed commit'], wtPath)

    const all = await listWorktrees(repoDir)
    const wt = all.find((w) => !w.isPrimary)
    if (!wt) throw new Error('no secondary worktree')

    const guard = await canDeleteWorktree(wt)
    expect(guard.ok).toBe(false)
    if (!guard.ok) {
      expect(guard.reasons).toContain('unpushed-commits')
    }
  })

  it('no upstream → reasons includes no-remote-tracking', async () => {
    const wtPath = join(repoDir, 'wt-noremote')
    // create worktree with new branch but do NOT push
    await createWorktree({ repoPath: repoDir, worktreePath: wtPath, branch: 'feat/noremote', baseBranch: 'main' })

    const all = await listWorktrees(repoDir)
    const wt = all.find((w) => !w.isPrimary)
    if (!wt) throw new Error('no secondary worktree')

    const guard = await canDeleteWorktree(wt)
    expect(guard.ok).toBe(false)
    if (!guard.ok) {
      expect(guard.reasons).toContain('no-remote-tracking')
    }
  })
})

describe('deleteWorktree', () => {
  it('removes worktree and list reflects it', async () => {
    const wtPath = join(repoDir, 'wt-del')
    await createWorktree({ repoPath: repoDir, worktreePath: wtPath, branch: 'feat/del', baseBranch: 'main' })

    let all = await listWorktrees(repoDir)
    expect(all).toHaveLength(2)

    await deleteWorktree(repoDir, wtPath)

    all = await listWorktrees(repoDir)
    expect(all).toHaveLength(1)
    expect(all[0]?.isPrimary).toBe(true)
  })
})

describe('isWorktreeUntouched', () => {
  it('true when clean + no commits ahead', async () => {
    const wtPath = join(repoDir, 'wt-clean')
    await createWorktree({
      repoPath: repoDir,
      worktreePath: wtPath,
      branch: 'feat/clean',
      baseBranch: 'main',
    })
    expect(await isWorktreeUntouched(wtPath, 'main')).toBe(true)
  })

  it('false when working tree is dirty', async () => {
    const wtPath = join(repoDir, 'wt-dirty')
    await createWorktree({
      repoPath: repoDir,
      worktreePath: wtPath,
      branch: 'feat/dirty',
      baseBranch: 'main',
    })
    await writeFile(join(wtPath, 'new.txt'), 'stuff')
    expect(await isWorktreeUntouched(wtPath, 'main')).toBe(false)
  })

  it('false when commits ahead of base', async () => {
    const wtPath = join(repoDir, 'wt-ahead')
    await createWorktree({
      repoPath: repoDir,
      worktreePath: wtPath,
      branch: 'feat/ahead',
      baseBranch: 'main',
    })
    await writeFile(join(wtPath, 'new.txt'), 'x')
    await gitOrThrow(['add', 'new.txt'], wtPath)
    await gitOrThrow(['commit', '-m', 'one'], wtPath)
    expect(await isWorktreeUntouched(wtPath, 'main')).toBe(false)
  })
})

describe('deleteBranchIfMerged', () => {
  it('succeeds for merged/empty branch', async () => {
    await gitOrThrow(['branch', 'feat/empty'], repoDir)
    expect(await deleteBranchIfMerged(repoDir, 'feat/empty')).toBe(true)
  })

  it('refuses when branch has unmerged commits', async () => {
    await gitOrThrow(['checkout', '-b', 'feat/unmerged'], repoDir)
    await writeFile(join(repoDir, 'a.txt'), 'a')
    await gitOrThrow(['add', 'a.txt'], repoDir)
    await gitOrThrow(['commit', '-m', 'a'], repoDir)
    await gitOrThrow(['checkout', 'main'], repoDir)
    expect(await deleteBranchIfMerged(repoDir, 'feat/unmerged')).toBe(false)
  })
})

describe('listLocalBranches / currentBranch', () => {
  it('returns all local branches', async () => {
    await gitOrThrow(['branch', 'feat/a'], repoDir)
    await gitOrThrow(['branch', 'feat/b'], repoDir)
    const branches = await listLocalBranches(repoDir)
    expect(branches.sort()).toEqual(['feat/a', 'feat/b', 'main'])
  })

  it('currentBranch returns HEAD branch', async () => {
    expect(await currentBranch(repoDir)).toBe('main')
  })
})
