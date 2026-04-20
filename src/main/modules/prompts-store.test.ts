import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setDataPathForTests,
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
} from './prompts-store'

let tmpDir: string
let promptsPath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'prompts-store-test-'))
  promptsPath = join(tmpDir, 'prompts.json')
  __setDataPathForTests(promptsPath)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('PromptsStore', () => {
  it('1. empty store returns []', async () => {
    const result = await listPrompts()
    expect(result).toEqual([])
  })

  it('2. createPrompt then listPrompts returns one item with correct fields', async () => {
    const created = await createPrompt({ title: 'Hello', body: 'World' })
    expect(created.id).toBeTruthy()
    expect(created.title).toBe('Hello')
    expect(created.body).toBe('World')
    expect(created.favorite).toBe(false)
    expect(typeof created.createdAt).toBe('number')
    expect(created.createdAt).toBe(created.updatedAt)

    const list = await listPrompts()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(created)
  })

  it('3. createPrompt with empty title throws', async () => {
    await expect(createPrompt({ title: '', body: 'x' })).rejects.toThrow(
      'Prompt title must not be empty',
    )
    await expect(createPrompt({ title: '   ', body: 'x' })).rejects.toThrow(
      'Prompt title must not be empty',
    )
  })

  it('4. updatePrompt patches title only, leaves body + favorite intact, bumps updatedAt', async () => {
    const created = await createPrompt({
      title: 'Old',
      body: 'Body',
      favorite: true,
    })
    // Ensure updatedAt can differ
    await new Promise((r) => setTimeout(r, 2))
    const updated = await updatePrompt(created.id, { title: 'New' })
    expect(updated.title).toBe('New')
    expect(updated.body).toBe('Body')
    expect(updated.favorite).toBe(true)
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt)
    expect(updated.createdAt).toBe(created.createdAt)
  })

  it('5. updatePrompt on unknown id throws', async () => {
    await expect(updatePrompt('nonexistent-uuid', { title: 'x' })).rejects.toThrow(
      'Prompt not found: nonexistent-uuid',
    )
  })

  it('6. deletePrompt removes; idempotent for missing id', async () => {
    const p = await createPrompt({ title: 'Delete me', body: '' })
    await deletePrompt(p.id)
    expect(await listPrompts()).toHaveLength(0)
    // Second delete is a no-op
    await expect(deletePrompt(p.id)).resolves.toBeUndefined()
  })

  it("7. listPrompts({ sort: 'favorites-first' }) — favorites first, within each group newest-first", async () => {
    const a = await createPrompt({ title: 'A', body: '', favorite: false })
    await new Promise((r) => setTimeout(r, 2))
    const b = await createPrompt({ title: 'B', body: '', favorite: true })
    await new Promise((r) => setTimeout(r, 2))
    const c = await createPrompt({ title: 'C', body: '', favorite: true })
    await new Promise((r) => setTimeout(r, 2))
    const d = await createPrompt({ title: 'D', body: '', favorite: false })

    const list = await listPrompts({ sort: 'favorites-first' })
    const ids = list.map((p) => p.id)
    // favorites: c (newest) then b; non-favorites: d (newest) then a
    expect(ids).toEqual([c.id, b.id, d.id, a.id])
  })

  it("8. listPrompts({ sort: 'title' }) — case-insensitive title order, ignoring favorite", async () => {
    await createPrompt({ title: 'banana', body: '', favorite: true })
    await createPrompt({ title: 'Apple', body: '', favorite: false })
    await createPrompt({ title: 'cherry', body: '', favorite: true })

    const list = await listPrompts({ sort: 'title' })
    const titles = list.map((p) => p.title)
    expect(titles).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('9. listPrompts({ query }) — matches title AND body case-insensitively', async () => {
    const a = await createPrompt({ title: 'Refactor code', body: 'some body' })
    const b = await createPrompt({ title: 'Fix bug', body: 'refactor needed' })
    await createPrompt({ title: 'Unrelated', body: 'nothing here' })

    const result = await listPrompts({ query: 'REFACTOR' })
    const ids = result.map((p) => p.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(expect.stringContaining('Unrelated'))
    expect(result).toHaveLength(2)
  })

  it('9b. getPrompt returns the matching prompt or null', async () => {
    const a = await createPrompt({ title: 'A', body: 'a' })
    expect((await getPrompt(a.id))?.id).toBe(a.id)
    expect(await getPrompt('nope')).toBeNull()
  })

  it('9c. listPrompts returns [] when file parses but mismatches the schema', async () => {
    await fs.writeFile(promptsPath, JSON.stringify({ version: 2, prompts: [] }), 'utf8')
    expect(await listPrompts()).toEqual([])
  })

  it('9d. updatePrompt and deletePrompt edge cases', async () => {
    const a = await createPrompt({ title: 'A', body: 'a' })
    const updated = await updatePrompt(a.id, { title: 'A!', favorite: true })
    expect(updated?.title).toBe('A!')
    expect(updated?.favorite).toBe(true)
    // updatePrompt with no title preserves existing title
    const noTitle = await updatePrompt(a.id, { favorite: false })
    expect(noTitle?.title).toBe('A!')
    expect(noTitle?.favorite).toBe(false)
    await expect(updatePrompt('nope', { title: 'x' })).rejects.toThrow(/not found/)
    await deletePrompt(a.id)
    await deletePrompt('nope')
    expect(await listPrompts()).toEqual([])
  })

  it('10. survives corrupt file — list returns [], subsequent create succeeds', async () => {
    await fs.writeFile(promptsPath, '<<< not json >>>', 'utf8')
    const list = await listPrompts()
    expect(list).toEqual([])

    const p = await createPrompt({ title: 'After corrupt', body: 'ok' })
    expect(p.title).toBe('After corrupt')
    const list2 = await listPrompts()
    expect(list2).toHaveLength(1)
  })
})
