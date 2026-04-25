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
  renameWindow,
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

  it('renameWindow updates only matching entries in the workspace', async () => {
    await add(entry({ windowName: 'claude-old', worktreePath: '/tmp/a' }))
    await add(entry({ windowName: 'claude-other', worktreePath: '/tmp/b' }))
    await renameWindow('ws-1', 'claude-old', 'claude-new')
    const all = await list('ws-1')
    const names = all.map((e) => e.windowName).sort()
    expect(names).toEqual(['claude-new', 'claude-other'])
  })

  it('renameWindow is a no-op when no entry matches', async () => {
    await add(entry({ windowName: 'claude-keep' }))
    await renameWindow('ws-1', 'claude-missing', 'claude-x')
    expect((await list('ws-1'))[0]!.windowName).toBe('claude-keep')
  })

  it('returns empty when the file parses but mismatches the schema', async () => {
    await fs.mkdir(tmpRoot, { recursive: true })
    await fs.writeFile(join(tmpRoot, 'ws-bad.json'), JSON.stringify({ version: 2, entries: [] }))
    expect(await list('ws-bad')).toEqual([])
  })
})
