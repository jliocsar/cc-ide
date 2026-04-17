import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setLegacyBaseForTests,
  createFolder,
  createPlan,
  deletePath,
  listTree,
  migrateLegacyIfNeeded,
  readPlan,
  rename,
  writePlan,
} from './plan-fs-tree'

let workspace: string
let legacyRoot: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(join(tmpdir(), 'plan-fs-tree-ws-'))
  legacyRoot = await fs.mkdtemp(join(tmpdir(), 'plan-fs-tree-legacy-'))
  __setLegacyBaseForTests(legacyRoot)
})

afterEach(async () => {
  __setLegacyBaseForTests(null)
  await fs.rm(workspace, { recursive: true, force: true })
  await fs.rm(legacyRoot, { recursive: true, force: true })
})

describe('listTree', () => {
  it('empty workspace returns root dir with no children', async () => {
    const root = await listTree(workspace)
    expect(root.kind).toBe('dir')
    expect(root.relPath).toBe('')
    expect(root.children).toEqual([])
  })

  it('creates <workspace>/.cc-ide/plans on first list', async () => {
    await listTree(workspace)
    const stat = await fs.stat(join(workspace, '.cc-ide', 'plans'))
    expect(stat.isDirectory()).toBe(true)
  })

  it('sorts dirs before files, alphabetical within group', async () => {
    await createFolder(workspace, 'zzz')
    await createFolder(workspace, 'aaa')
    await createPlan(workspace, 'beta.md')
    await createPlan(workspace, 'alpha.md')
    const root = await listTree(workspace)
    expect(root.children.map((c) => c.name)).toEqual(['aaa', 'zzz', 'alpha.md', 'beta.md'])
  })
})

describe('createPlan', () => {
  it('rejects a name that does not end in .md', async () => {
    await expect(createPlan(workspace, 'foo')).rejects.toThrow(/must end in \.md/)
    await expect(createPlan(workspace, 'foo.txt')).rejects.toThrow(/must end in \.md/)
  })

  it('accepts a .md filename', async () => {
    await createPlan(workspace, 'foo.md')
    const root = await listTree(workspace)
    expect(root.children).toHaveLength(1)
    expect(root.children[0]!.name).toBe('foo.md')
  })

  it('throws if file already exists', async () => {
    await createPlan(workspace, 'foo.md')
    await expect(createPlan(workspace, 'foo.md')).rejects.toThrow(/already exists/)
  })

  it('throws on empty relPath', async () => {
    await expect(createPlan(workspace, '')).rejects.toThrow(/required/)
  })
})

describe('createFolder', () => {
  it('creates nested directories', async () => {
    await createFolder(workspace, 'a/b/c')
    const root = await listTree(workspace)
    const a = root.children[0]
    expect(a?.kind).toBe('dir')
    expect((a as { children: unknown[] }).children).toHaveLength(1)
  })

  it('throws if folder already exists', async () => {
    await createFolder(workspace, 'docs')
    await expect(createFolder(workspace, 'docs')).rejects.toThrow(/already exists/)
  })
})

describe('readPlan / writePlan', () => {
  it('roundtrips unicode + newlines + backticks', async () => {
    const body = 'héllo\n```ts\nlet x = 1\n```\n— done'
    await writePlan(workspace, 'plan.md', body)
    expect(await readPlan(workspace, 'plan.md')).toBe(body)
  })

  it('writePlan creates missing parent dirs', async () => {
    await writePlan(workspace, 'nested/deep/plan.md', 'x')
    expect(await readPlan(workspace, 'nested/deep/plan.md')).toBe('x')
  })
})

describe('rename', () => {
  it('renames a file in place', async () => {
    await createPlan(workspace, 'old.md')
    await rename(workspace, 'old.md', 'new.md')
    const root = await listTree(workspace)
    expect(root.children[0]!.name).toBe('new.md')
  })

  it('moves a file across directories', async () => {
    await createPlan(workspace, 'foo.md')
    await createFolder(workspace, 'sub')
    await rename(workspace, 'foo.md', 'sub/foo.md')
    expect(await readPlan(workspace, 'sub/foo.md')).toBe('')
  })

  it('throws if destination exists', async () => {
    await createPlan(workspace, 'a.md')
    await createPlan(workspace, 'b.md')
    await expect(rename(workspace, 'a.md', 'b.md')).rejects.toThrow(/already exists/)
  })

  it('overwrites destination file when overwrite: true', async () => {
    await createPlan(workspace, 'a.md')
    await writePlan(workspace, 'a.md', 'fresh')
    await createPlan(workspace, 'b.md')
    await writePlan(workspace, 'b.md', 'stale')
    await rename(workspace, 'a.md', 'b.md', { overwrite: true })
    expect(await readPlan(workspace, 'b.md')).toBe('fresh')
  })

  it('refuses to overwrite a folder even with overwrite: true', async () => {
    await createPlan(workspace, 'a.md')
    await createFolder(workspace, 'b')
    await expect(rename(workspace, 'a.md', 'b', { overwrite: true })).rejects.toThrow(
      /cannot overwrite a folder/,
    )
  })

  it('refuses to move a folder into one of its descendants', async () => {
    await createFolder(workspace, 'A')
    await createFolder(workspace, 'A/B')
    await expect(rename(workspace, 'A', 'A/B/A')).rejects.toThrow(/descendants/)
  })

  it('no-op when fromRel === toRel', async () => {
    await createPlan(workspace, 'a.md')
    await rename(workspace, 'a.md', 'a.md')
    expect(await readPlan(workspace, 'a.md')).toBe('')
  })
})

describe('deletePath', () => {
  it('removes a file; idempotent on missing', async () => {
    await createPlan(workspace, 'tmp.md')
    await deletePath(workspace, 'tmp.md')
    await deletePath(workspace, 'tmp.md')
    const root = await listTree(workspace)
    expect(root.children).toEqual([])
  })

  it('removes a directory recursively', async () => {
    await createFolder(workspace, 'docs/sub')
    await writePlan(workspace, 'docs/sub/x.md', 'x')
    await deletePath(workspace, 'docs')
    const root = await listTree(workspace)
    expect(root.children).toEqual([])
  })
})

describe('path safety', () => {
  it('rejects ../ traversal', async () => {
    await expect(readPlan(workspace, '../../../etc/passwd')).rejects.toThrow(/escapes/)
  })

  it('rejects absolute paths', async () => {
    await expect(readPlan(workspace, '/etc/passwd')).rejects.toThrow(/absolute/)
  })

  it('rejects null byte', async () => {
    await expect(readPlan(workspace, 'foo\0bar')).rejects.toThrow(/null byte/)
  })
})

describe('migrateLegacyIfNeeded', () => {
  const WS_ID = 'ws-42'

  async function seedLegacy(files: Record<string, string>): Promise<void> {
    const legacyWs = join(legacyRoot, WS_ID)
    await fs.mkdir(legacyWs, { recursive: true })
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(legacyWs, rel)
      await fs.mkdir(join(abs, '..'), { recursive: true })
      await fs.writeFile(abs, body, 'utf8')
    }
  }

  it('migrates legacy content when destination is missing', async () => {
    await seedLegacy({ 'a.md': 'one', 'folder/b.md': 'two' })
    const result = await migrateLegacyIfNeeded(WS_ID, workspace)
    expect(result).toBe('migrated')
    expect(await readPlan(workspace, 'a.md')).toBe('one')
    expect(await readPlan(workspace, 'folder/b.md')).toBe('two')
    // Legacy should be gone
    const legacyStat = await fs.stat(join(legacyRoot, WS_ID)).catch(() => null)
    expect(legacyStat).toBeNull()
  })

  it('migrates into an existing empty destination dir', async () => {
    await fs.mkdir(join(workspace, '.cc-ide', 'plans'), { recursive: true })
    await seedLegacy({ 'a.md': 'x' })
    const result = await migrateLegacyIfNeeded(WS_ID, workspace)
    expect(result).toBe('migrated')
    expect(await readPlan(workspace, 'a.md')).toBe('x')
  })

  it('skips when legacy does not exist', async () => {
    const result = await migrateLegacyIfNeeded(WS_ID, workspace)
    expect(result).toBe('skipped-no-source')
  })

  it('skips when legacy is empty', async () => {
    await fs.mkdir(join(legacyRoot, WS_ID), { recursive: true })
    const result = await migrateLegacyIfNeeded(WS_ID, workspace)
    expect(result).toBe('skipped-no-source')
  })

  it('refuses to migrate when destination has content', async () => {
    await seedLegacy({ 'legacy.md': 'leg' })
    await writePlan(workspace, 'existing.md', 'dest')
    const result = await migrateLegacyIfNeeded(WS_ID, workspace)
    expect(result).toBe('skipped-dest-populated')
    // Both paths still hold their content — no data loss
    expect(await fs.readFile(join(legacyRoot, WS_ID, 'legacy.md'), 'utf8')).toBe('leg')
    expect(await readPlan(workspace, 'existing.md')).toBe('dest')
  })

  it('is idempotent on second call', async () => {
    await seedLegacy({ 'a.md': 'x' })
    expect(await migrateLegacyIfNeeded(WS_ID, workspace)).toBe('migrated')
    expect(await migrateLegacyIfNeeded(WS_ID, workspace)).toBe('skipped-no-source')
  })

  it('rejects invalid workspaceId with separators', async () => {
    await expect(migrateLegacyIfNeeded('bad/id', workspace)).rejects.toThrow(/invalid workspaceId/)
  })
})
