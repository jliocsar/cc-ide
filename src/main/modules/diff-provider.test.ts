import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { listChangedFiles, getFileDiff } from './diff-provider.js'

const exec = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd })
  return stdout.trim()
}

async function makeRepo(): Promise<string> {
  const dir = join(tmpdir(), `cc-ide-diff-test-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })
  await git(dir, 'init')
  await git(dir, 'config', 'user.email', 'test@test.com')
  await git(dir, 'config', 'user.name', 'Test')
  await git(dir, 'config', 'commit.gpgsign', 'false')
  return dir
}

async function initialCommit(dir: string, filename = 'file.txt', content = 'line1\nline2\nline3\n'): Promise<void> {
  await fs.writeFile(join(dir, filename), content)
  await git(dir, 'add', filename)
  await git(dir, 'commit', '-m', 'init')
}

let testDir: string

beforeEach(async () => {
  testDir = await makeRepo()
})

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true })
})

describe('listChangedFiles', () => {
  it('returns empty array when no changes', async () => {
    await initialCommit(testDir)
    const files = await listChangedFiles(testDir)
    expect(files).toEqual([])
  })

  it('returns one staged entry on staged modification', async () => {
    await initialCommit(testDir)
    await fs.writeFile(join(testDir, 'file.txt'), 'line1\nline2\nline3\nnewline\n')
    await git(testDir, 'add', 'file.txt')

    const files = await listChangedFiles(testDir)
    expect(files).toHaveLength(1)
    const f = files[0]
    expect(f).toBeDefined()
    expect(f!.stage).toBe('staged')
    expect(f!.status).toBe('modified')
    expect(f!.path).toBe('file.txt')
    expect(f!.additions).toBe(1)
    expect(f!.deletions).toBe(0)
  })

  it('returns two entries when file is staged and then further modified unstaged', async () => {
    await initialCommit(testDir)
    // stage one change
    await fs.writeFile(join(testDir, 'file.txt'), 'line1\nline2\nline3\nstaged_line\n')
    await git(testDir, 'add', 'file.txt')
    // further modify unstaged
    await fs.writeFile(join(testDir, 'file.txt'), 'line1\nline2\nline3\nstaged_line\nunstaged_line\n')

    const files = await listChangedFiles(testDir)
    const staged = files.filter((f) => f.stage === 'staged')
    const unstaged = files.filter((f) => f.stage === 'unstaged')

    expect(staged).toHaveLength(1)
    expect(unstaged).toHaveLength(1)
    expect(staged[0]!.additions).toBe(1)
    expect(staged[0]!.deletions).toBe(0)
    // unstaged diff is index vs worktree: +1 line added vs staged
    expect(unstaged[0]!.additions).toBe(1)
    expect(unstaged[0]!.deletions).toBe(0)
  })

  it('returns untracked file as unstaged with status untracked', async () => {
    await initialCommit(testDir)
    await fs.writeFile(join(testDir, 'new.txt'), 'hello\n')

    const files = await listChangedFiles(testDir)
    expect(files).toHaveLength(1)
    const f = files[0]
    expect(f!.status).toBe('untracked')
    expect(f!.stage).toBe('unstaged')
    expect(f!.path).toBe('new.txt')
  })

  it('returns staged rename with status renamed and oldPath set', async () => {
    await initialCommit(testDir)
    await git(testDir, 'mv', 'file.txt', 'renamed.txt')

    const files = await listChangedFiles(testDir)
    const renames = files.filter((f) => f.status === 'renamed')
    expect(renames).toHaveLength(1)
    expect(renames[0]!.path).toBe('renamed.txt')
    expect(renames[0]!.oldPath).toBe('file.txt')
    expect(renames[0]!.stage).toBe('staged')
  })

  it('returns staged delete with correct deletion count', async () => {
    await initialCommit(testDir, 'file.txt', 'line1\nline2\nline3\n')
    await git(testDir, 'rm', 'file.txt')

    const files = await listChangedFiles(testDir)
    const deleted = files.filter((f) => f.status === 'deleted')
    expect(deleted).toHaveLength(1)
    expect(deleted[0]!.stage).toBe('staged')
    expect(deleted[0]!.deletions).toBe(3)
  })
})

describe('getFileDiff', () => {
  it('returns hunks with correct line numbers for a plain modification', async () => {
    await initialCommit(testDir, 'file.txt', 'line1\nline2\nline3\n')
    await fs.writeFile(join(testDir, 'file.txt'), 'line1\nline2 modified\nline3\n')
    await git(testDir, 'add', 'file.txt')

    const result = await getFileDiff(testDir, 'file.txt', 'staged')
    expect(result.tooLarge).toBe(false)
    expect(result.binary).toBe(false)
    expect(result.hunks.length).toBeGreaterThan(0)

    const hunk = result.hunks[0]!
    // Should contain context, remove, add lines
    const removes = hunk.lines.filter((l) => l.kind === 'remove')
    const adds = hunk.lines.filter((l) => l.kind === 'add')
    expect(removes).toHaveLength(1)
    expect(adds).toHaveLength(1)
    expect(removes[0]!.content).toBe('line2')
    expect(adds[0]!.content).toBe('line2 modified')

    // Line numbers: line2 is line 2
    expect(removes[0]!.oldLineNo).toBe(2)
    expect(removes[0]!.newLineNo).toBeNull()
    expect(adds[0]!.newLineNo).toBe(2)
    expect(adds[0]!.oldLineNo).toBeNull()

    // Context lines should have both line numbers
    const context = hunk.lines.filter((l) => l.kind === 'context')
    for (const c of context) {
      expect(c.oldLineNo).not.toBeNull()
      expect(c.newLineNo).not.toBeNull()
    }
  })

  it('returns single pure-add hunk for untracked file starting at newStart 1', async () => {
    await initialCommit(testDir)
    await fs.writeFile(join(testDir, 'new.txt'), 'alpha\nbeta\ngamma\n')

    const result = await getFileDiff(testDir, 'new.txt', 'unstaged')
    expect(result.tooLarge).toBe(false)
    expect(result.binary).toBe(false)
    expect(result.hunks).toHaveLength(1)

    const hunk = result.hunks[0]!
    expect(hunk.oldStart).toBe(0)
    expect(hunk.oldLines).toBe(0)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newLines).toBe(3)
    expect(hunk.lines).toHaveLength(3)
    expect(hunk.lines.every((l) => l.kind === 'add')).toBe(true)
    expect(hunk.lines[0]!.content).toBe('alpha')
    expect(hunk.lines[0]!.newLineNo).toBe(1)
    expect(hunk.lines[2]!.newLineNo).toBe(3)
  })

  it('returns tooLarge true for a file exceeding 20k lines', async () => {
    // Write a file with >20k lines, then create initial commit with empty,
    // then modify to big content
    await initialCommit(testDir, 'big.txt', 'seed\n')
    const bigContent = Array.from({ length: 20_001 }, (_, i) => `line${i}`).join('\n') + '\n'
    await fs.writeFile(join(testDir, 'big.txt'), bigContent)
    await git(testDir, 'add', 'big.txt')

    const result = await getFileDiff(testDir, 'big.txt', 'staged')
    expect(result.tooLarge).toBe(true)
    expect(result.hunks).toEqual([])
    expect(result.file.path).toBe('big.txt')
  })
})
