import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitLsFiles } from './discovery'

let repo: string

beforeEach(async () => {
  repo = await fs.mkdtemp(join(tmpdir(), 'discovery-'))
})

afterEach(async () => {
  await fs.rm(repo, { recursive: true, force: true })
})

describe('gitLsFiles', () => {
  it('rejects when workspace is not a git repo', async () => {
    await expect(gitLsFiles('/nonexistent/path')).rejects.toThrow('git ls-files exited 128')
  })

  it('returns empty array when repo has no files', async () => {
    const result = await gitLsFiles(__dirname)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns [] when an empty git repo has no tracked files', async () => {
    spawnSync('git', ['init', '-q'], { cwd: repo })
    const result = await gitLsFiles(repo)
    expect(result).toEqual([])
  })

  it('returns tracked files for a populated repo', async () => {
    spawnSync('git', ['init', '-q'], { cwd: repo })
    spawnSync('git', ['config', 'user.email', 't@t'], { cwd: repo })
    spawnSync('git', ['config', 'user.name', 't'], { cwd: repo })
    await fs.writeFile(join(repo, 'a.ts'), 'x', 'utf8')
    spawnSync('git', ['add', '-A'], { cwd: repo })
    spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo })
    const result = await gitLsFiles(repo)
    expect(result).toContain('a.ts')
  })
})
