import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setRootForTests,
  createFolder,
  createPlan,
  deletePath,
  listTree,
  readPlan,
  rename,
  writePlan,
} from './plan-fs-tree'

const WORKSPACE = 'ws-test'
let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(join(tmpdir(), 'plan-fs-tree-'))
  __setRootForTests(tmpRoot)
})

afterEach(async () => {
  __setRootForTests(null)
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('listTree', () => {
  it('empty workspace returns root dir with no children', async () => {
    const root = await listTree(WORKSPACE)
    expect(root.kind).toBe('dir')
    expect(root.relPath).toBe('')
    expect(root.children).toEqual([])
  })

  it('sorts dirs before files, alphabetical within group', async () => {
    await createFolder(WORKSPACE, 'zzz')
    await createFolder(WORKSPACE, 'aaa')
    await createPlan(WORKSPACE, 'beta')
    await createPlan(WORKSPACE, 'alpha')
    const root = await listTree(WORKSPACE)
    expect(root.children.map((c) => c.name)).toEqual(['aaa', 'zzz', 'alpha.md', 'beta.md'])
  })
})

describe('createPlan', () => {
  it('appends .md if missing', async () => {
    await createPlan(WORKSPACE, 'foo')
    const root = await listTree(WORKSPACE)
    expect(root.children[0]!.name).toBe('foo.md')
  })

  it('respects existing .md suffix', async () => {
    await createPlan(WORKSPACE, 'foo.md')
    const root = await listTree(WORKSPACE)
    expect(root.children).toHaveLength(1)
    expect(root.children[0]!.name).toBe('foo.md')
  })

  it('throws if file already exists', async () => {
    await createPlan(WORKSPACE, 'foo')
    await expect(createPlan(WORKSPACE, 'foo')).rejects.toThrow(/already exists/)
  })

  it('throws on empty relPath', async () => {
    await expect(createPlan(WORKSPACE, '')).rejects.toThrow(/required/)
  })
})

describe('createFolder', () => {
  it('creates nested directories', async () => {
    await createFolder(WORKSPACE, 'a/b/c')
    const root = await listTree(WORKSPACE)
    const a = root.children[0]
    expect(a?.kind).toBe('dir')
    expect((a as { children: unknown[] }).children).toHaveLength(1)
  })

  it('throws if folder already exists', async () => {
    await createFolder(WORKSPACE, 'docs')
    await expect(createFolder(WORKSPACE, 'docs')).rejects.toThrow(/already exists/)
  })
})

describe('readPlan / writePlan', () => {
  it('roundtrips unicode + newlines + backticks', async () => {
    const body = 'héllo\n```ts\nlet x = 1\n```\n— done'
    await writePlan(WORKSPACE, 'plan.md', body)
    expect(await readPlan(WORKSPACE, 'plan.md')).toBe(body)
  })

  it('writePlan creates missing parent dirs', async () => {
    await writePlan(WORKSPACE, 'nested/deep/plan.md', 'x')
    expect(await readPlan(WORKSPACE, 'nested/deep/plan.md')).toBe('x')
  })
})

describe('rename', () => {
  it('renames a file in place', async () => {
    await createPlan(WORKSPACE, 'old')
    await rename(WORKSPACE, 'old.md', 'new.md')
    const root = await listTree(WORKSPACE)
    expect(root.children[0]!.name).toBe('new.md')
  })

  it('moves a file across directories', async () => {
    await createPlan(WORKSPACE, 'foo')
    await createFolder(WORKSPACE, 'sub')
    await rename(WORKSPACE, 'foo.md', 'sub/foo.md')
    expect(await readPlan(WORKSPACE, 'sub/foo.md')).toBe('')
  })

  it('throws if destination exists', async () => {
    await createPlan(WORKSPACE, 'a')
    await createPlan(WORKSPACE, 'b')
    await expect(rename(WORKSPACE, 'a.md', 'b.md')).rejects.toThrow(/already exists/)
  })

  it('overwrites destination file when overwrite: true', async () => {
    await createPlan(WORKSPACE, 'a')
    await writePlan(WORKSPACE, 'a.md', 'fresh')
    await createPlan(WORKSPACE, 'b')
    await writePlan(WORKSPACE, 'b.md', 'stale')
    await rename(WORKSPACE, 'a.md', 'b.md', { overwrite: true })
    expect(await readPlan(WORKSPACE, 'b.md')).toBe('fresh')
  })

  it('refuses to overwrite a folder even with overwrite: true', async () => {
    await createPlan(WORKSPACE, 'a')
    await createFolder(WORKSPACE, 'b')
    await expect(
      rename(WORKSPACE, 'a.md', 'b', { overwrite: true }),
    ).rejects.toThrow(/cannot overwrite a folder/)
  })

  it('refuses to move a folder into one of its descendants', async () => {
    await createFolder(WORKSPACE, 'A')
    await createFolder(WORKSPACE, 'A/B')
    await expect(rename(WORKSPACE, 'A', 'A/B/A')).rejects.toThrow(/descendants/)
  })

  it('no-op when fromRel === toRel', async () => {
    await createPlan(WORKSPACE, 'a')
    await rename(WORKSPACE, 'a.md', 'a.md')
    expect(await readPlan(WORKSPACE, 'a.md')).toBe('')
  })
})

describe('deletePath', () => {
  it('removes a file; idempotent on missing', async () => {
    await createPlan(WORKSPACE, 'tmp')
    await deletePath(WORKSPACE, 'tmp.md')
    await deletePath(WORKSPACE, 'tmp.md')
    const root = await listTree(WORKSPACE)
    expect(root.children).toEqual([])
  })

  it('removes a directory recursively', async () => {
    await createFolder(WORKSPACE, 'docs/sub')
    await writePlan(WORKSPACE, 'docs/sub/x.md', 'x')
    await deletePath(WORKSPACE, 'docs')
    const root = await listTree(WORKSPACE)
    expect(root.children).toEqual([])
  })
})

describe('path safety', () => {
  it('rejects ../ traversal', async () => {
    await expect(readPlan(WORKSPACE, '../../../etc/passwd')).rejects.toThrow(/escapes/)
  })

  it('rejects absolute paths', async () => {
    await expect(readPlan(WORKSPACE, '/etc/passwd')).rejects.toThrow(/absolute/)
  })

  it('rejects null byte', async () => {
    await expect(readPlan(WORKSPACE, 'foo\0bar')).rejects.toThrow(/null byte/)
  })
})
