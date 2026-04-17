import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setRootForTests,
  add,
  type EphemeralEntry,
  findByPath,
  findByWindow,
  list,
  remove,
} from './ephemeral-worktrees'

let tmpRoot: string

const entry = (overrides: Partial<EphemeralEntry> = {}): EphemeralEntry => ({
  workspaceId: 'ws-1',
  worktreePath: '/tmp/a/.claude/worktrees/foo',
  branch: 'feat/foo',
  base: 'main',
  windowName: 'claude-oreo',
  createdAt: 1000,
  ...overrides,
})

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(join(tmpdir(), 'ccide-ephem-'))
  __setRootForTests(tmpRoot)
})

afterEach(async () => {
  __setRootForTests(null)
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('ephemeral-worktrees', () => {
  it('add + list round-trips', async () => {
    await add(entry())
    const all = await list('ws-1')
    expect(all).toHaveLength(1)
    expect(all[0]!.branch).toBe('feat/foo')
  })

  it('add replaces entry with same worktreePath', async () => {
    await add(entry({ branch: 'v1' }))
    await add(entry({ branch: 'v2' }))
    const all = await list('ws-1')
    expect(all).toHaveLength(1)
    expect(all[0]!.branch).toBe('v2')
  })

  it('remove drops the entry', async () => {
    await add(entry())
    await remove('ws-1', entry().worktreePath)
    expect(await list('ws-1')).toEqual([])
  })

  it('remove is a no-op when entry absent', async () => {
    await remove('ws-1', '/missing')
    expect(await list('ws-1')).toEqual([])
  })

  it('findByWindow / findByPath', async () => {
    await add(entry({ windowName: 'claude-mochi' }))
    expect(await findByWindow('ws-1', 'claude-mochi')).not.toBeNull()
    expect(await findByWindow('ws-1', 'nope')).toBeNull()
    expect(await findByPath('ws-1', entry().worktreePath)).not.toBeNull()
  })

  it('isolates entries per workspace', async () => {
    await add(entry({ workspaceId: 'ws-1' }))
    await add(entry({ workspaceId: 'ws-2', worktreePath: '/tmp/b' }))
    expect(await list('ws-1')).toHaveLength(1)
    expect(await list('ws-2')).toHaveLength(1)
  })

  it('survives corrupt files by returning empty', async () => {
    await fs.mkdir(tmpRoot, { recursive: true })
    await fs.writeFile(join(tmpRoot, 'ws-broken.json'), '{ not: json')
    expect(await list('ws-broken')).toEqual([])
  })
})
