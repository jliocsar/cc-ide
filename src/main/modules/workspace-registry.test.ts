import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setRootForTests,
  addWorkspace,
  getWorkspace,
  listWorkspaces,
  removeWorkspace,
} from './workspace-registry'

let root: string
let repo: string
let notRepo: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ws-registry-'))
  __setRootForTests(root)
  repo = await fs.mkdtemp(join(tmpdir(), 'ws-repo-'))
  spawnSync('git', ['init', '-q'], { cwd: repo })
  notRepo = await fs.mkdtemp(join(tmpdir(), 'ws-notrepo-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(repo, { recursive: true, force: true })
  await fs.rm(notRepo, { recursive: true, force: true })
})

describe('workspace-registry', () => {
  it('returns [] with no file', async () => {
    expect(await listWorkspaces()).toEqual([])
  })

  it('adds a git repo and returns it from list', async () => {
    const ws = await addWorkspace(repo)
    expect(ws.path).toBe(repo)
    expect(ws.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ws.addedAt).toBeTypeOf('number')
    const all = await listWorkspaces()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe(ws.id)
  })

  it('rejects non-git directories', async () => {
    await expect(addWorkspace(notRepo)).rejects.toThrow(/Not a git repository/)
  })

  it('returns existing workspace when adding same path twice', async () => {
    const a = await addWorkspace(repo)
    const b = await addWorkspace(repo)
    expect(a.id).toBe(b.id)
    expect(await listWorkspaces()).toHaveLength(1)
  })

  it('getWorkspace returns the added workspace by id, or null', async () => {
    const ws = await addWorkspace(repo)
    expect((await getWorkspace(ws.id))?.id).toBe(ws.id)
    expect(await getWorkspace('missing-id')).toBeNull()
  })

  it('removeWorkspace removes by id; no-op when absent', async () => {
    const ws = await addWorkspace(repo)
    await removeWorkspace('nope')
    expect(await listWorkspaces()).toHaveLength(1)
    await removeWorkspace(ws.id)
    expect(await listWorkspaces()).toHaveLength(0)
  })

  it('rethrows on corrupt registry file', async () => {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, 'workspaces.json'), '<<< not json >>>', 'utf8')
    await expect(listWorkspaces()).rejects.toThrow()
  })

  it('returns [] when registry schema is invalid', async () => {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      join(root, 'workspaces.json'),
      JSON.stringify({ version: 2, workspaces: [] }),
      'utf8',
    )
    expect(await listWorkspaces()).toEqual([])
  })

  it('rethrows non-ENOENT read errors', async () => {
    await fs.mkdir(root, { recursive: true })
    const path = join(root, 'workspaces.json')
    await fs.mkdir(path)
    await expect(listWorkspaces()).rejects.toThrow()
  })

  it('isGitRepo returns false when git binary errors out', async () => {
    const fakePath = join(notRepo, 'does-not-exist')
    await expect(addWorkspace(fakePath)).rejects.toThrow()
  })
})
