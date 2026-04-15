import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __setRootForTests, loadTabs, saveTabs } from './tabs-store'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'tabs-store-'))
  __setRootForTests(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('tabs-store', () => {
  it('returns null when no file exists', async () => {
    const state = await loadTabs('ws-1')
    expect(state).toBeNull()
  })

  it('saves and loads back round-trip', async () => {
    const data = { tabs: [{ id: 'board', kind: 'board', title: 'Board', pinned: true }], activeId: 'board' }
    await saveTabs('ws-1', data)
    const loaded = await loadTabs('ws-1')
    expect(loaded).toEqual(data)
  })

  it('scopes files per workspace', async () => {
    await saveTabs('ws-a', { activeId: 'a' })
    await saveTabs('ws-b', { activeId: 'b' })
    expect(await loadTabs('ws-a')).toEqual({ activeId: 'a' })
    expect(await loadTabs('ws-b')).toEqual({ activeId: 'b' })
  })

  it('sanitizes unsafe workspaceId characters in filename', async () => {
    await saveTabs('ws/../../danger', { x: 1 })
    const files = await fs.readdir(root)
    expect(files.every((f) => !f.includes('..') && !f.includes('/'))).toBe(true)
  })
})
