import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFolder,
  createPrompt,
  deletePath,
  listTree,
  readPrompt,
  rename,
  writePrompt,
} from './prompts-fs-tree'

let workspace: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(join(tmpdir(), 'prompts-fs-tree-'))
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('listTree', () => {
  it('empty workspace returns root dir with no children', async () => {
    const root = await listTree(workspace)
    expect(root.kind).toBe('dir')
    expect(root.relPath).toBe('')
    expect(root.children).toEqual([])
  })

  it('creates <workspace>/.cc-ide/prompts on first list', async () => {
    await listTree(workspace)
    const stat = await fs.stat(join(workspace, '.cc-ide', 'prompts'))
    expect(stat.isDirectory()).toBe(true)
  })

  it('sorts dirs before files, alphabetical within group', async () => {
    await createFolder(workspace, 'zzz')
    await createFolder(workspace, 'aaa')
    await createPrompt(workspace, 'beta.md')
    await createPrompt(workspace, 'alpha.md')
    const root = await listTree(workspace)
    expect(root.children.map((c) => c.name)).toEqual(['aaa', 'zzz', 'alpha.md', 'beta.md'])
  })
})

describe('createPrompt', () => {
  it('rejects a name that does not end in .md', async () => {
    await expect(createPrompt(workspace, 'foo')).rejects.toThrow(/must end in \.md/)
    await expect(createPrompt(workspace, 'foo.txt')).rejects.toThrow(/must end in \.md/)
  })

  it('accepts a .md filename', async () => {
    await createPrompt(workspace, 'foo.md')
    const root = await listTree(workspace)
    expect(root.children).toHaveLength(1)
    expect(root.children[0]!.name).toBe('foo.md')
  })

  it('throws if file already exists', async () => {
    await createPrompt(workspace, 'foo.md')
    await expect(createPrompt(workspace, 'foo.md')).rejects.toThrow(/already exists/)
  })

  it('throws on empty relPath', async () => {
    await expect(createPrompt(workspace, '')).rejects.toThrow(/required/)
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

describe('readPrompt / writePrompt', () => {
  it('roundtrips unicode + newlines + backticks', async () => {
    const body = 'héllo\n```ts\nlet x = 1\n```\n— done'
    await writePrompt(workspace, 'p.md', body)
    expect(await readPrompt(workspace, 'p.md')).toBe(body)
  })

  it('writePrompt creates missing parent dirs', async () => {
    await writePrompt(workspace, 'nested/deep/p.md', 'x')
    expect(await readPrompt(workspace, 'nested/deep/p.md')).toBe('x')
  })

  it('concurrent writes to the same file do not race on the tmp suffix', async () => {
    const path = 'race.md'
    await Promise.all([
      writePrompt(workspace, path, 'a'.repeat(10_000)),
      writePrompt(workspace, path, 'b'.repeat(10_000)),
    ])
    const final = await readPrompt(workspace, path)
    expect(final.length).toBe(10_000)
    expect(final === 'a'.repeat(10_000) || final === 'b'.repeat(10_000)).toBe(true)
  })
})

describe('rename', () => {
  it('renames a file in place', async () => {
    await createPrompt(workspace, 'old.md')
    await rename(workspace, 'old.md', 'new.md')
    const root = await listTree(workspace)
    expect(root.children[0]!.name).toBe('new.md')
  })

  it('moves a file across directories', async () => {
    await createPrompt(workspace, 'foo.md')
    await createFolder(workspace, 'sub')
    await rename(workspace, 'foo.md', 'sub/foo.md')
    expect(await readPrompt(workspace, 'sub/foo.md')).toBe('')
  })

  it('throws if destination exists', async () => {
    await createPrompt(workspace, 'a.md')
    await createPrompt(workspace, 'b.md')
    await expect(rename(workspace, 'a.md', 'b.md')).rejects.toThrow(/already exists/)
  })

  it('overwrites destination file when overwrite: true', async () => {
    await createPrompt(workspace, 'a.md')
    await writePrompt(workspace, 'a.md', 'fresh')
    await createPrompt(workspace, 'b.md')
    await writePrompt(workspace, 'b.md', 'stale')
    await rename(workspace, 'a.md', 'b.md', { overwrite: true })
    expect(await readPrompt(workspace, 'b.md')).toBe('fresh')
  })

  it('refuses to overwrite a folder even with overwrite: true', async () => {
    await createPrompt(workspace, 'a.md')
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
    await createPrompt(workspace, 'a.md')
    await rename(workspace, 'a.md', 'a.md')
    expect(await readPrompt(workspace, 'a.md')).toBe('')
  })

  it('refuses to rename a .md file to a non-.md path', async () => {
    await createPrompt(workspace, 'a.md')
    await expect(rename(workspace, 'a.md', 'a.txt')).rejects.toThrow(/must end in \.md/)
  })
})

describe('listTree errors', () => {
  it('rethrows non-ENOENT readdir failures', async () => {
    await fs.mkdir(join(workspace, '.cc-ide'), { recursive: true })
    await fs.writeFile(join(workspace, '.cc-ide', 'prompts'), 'not-a-dir', 'utf8')
    await expect(listTree(workspace)).rejects.toThrow()
  })

  it('rethrows EACCES on a sub-directory readdir', async () => {
    await createPrompt(workspace, 'top.md')
    await createFolder(workspace, 'sub')
    const subDir = join(workspace, '.cc-ide', 'prompts', 'sub')
    await fs.chmod(subDir, 0o000)
    try {
      await expect(listTree(workspace)).rejects.toThrow()
    } finally {
      await fs.chmod(subDir, 0o755)
    }
  })

  it('createPrompt rethrows on non-EEXIST open failure', async () => {
    await createFolder(workspace, 'locked')
    const lockedDir = join(workspace, '.cc-ide', 'prompts', 'locked')
    await fs.chmod(lockedDir, 0o500)
    try {
      await expect(createPrompt(workspace, 'locked/new.md')).rejects.toThrow()
    } finally {
      await fs.chmod(lockedDir, 0o755)
    }
  })
})

describe('deletePath', () => {
  it('removes a file; idempotent on missing', async () => {
    await createPrompt(workspace, 'tmp.md')
    await deletePath(workspace, 'tmp.md')
    await deletePath(workspace, 'tmp.md')
    const root = await listTree(workspace)
    expect(root.children).toEqual([])
  })

  it('removes a directory recursively', async () => {
    await createFolder(workspace, 'docs/sub')
    await writePrompt(workspace, 'docs/sub/x.md', 'x')
    await deletePath(workspace, 'docs')
    const root = await listTree(workspace)
    expect(root.children).toEqual([])
  })
})

describe('path safety', () => {
  it('rejects ../ traversal', async () => {
    await expect(readPrompt(workspace, '../../../etc/passwd')).rejects.toThrow(/escapes/)
  })

  it('rejects absolute paths', async () => {
    await expect(readPrompt(workspace, '/etc/passwd')).rejects.toThrow(/absolute/)
  })

  it('rejects null byte', async () => {
    await expect(readPrompt(workspace, 'foo\0bar')).rejects.toThrow(/null byte/)
  })
})
