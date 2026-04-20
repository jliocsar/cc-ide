import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __setRootForTests, loadCanvas, saveCanvas } from './canvas-store'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'canvas-store-'))
  __setRootForTests(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('canvas-store', () => {
  it('returns null when no file exists', async () => {
    expect(await loadCanvas('ws-1')).toBeNull()
  })

  it('saves and loads back round-trip', async () => {
    const data = { camera: { x: 10, y: 20, scale: 1 }, windows: [] }
    await saveCanvas('ws-1', data)
    expect(await loadCanvas('ws-1')).toEqual(data)
  })

  it('scopes files per workspace', async () => {
    await saveCanvas('ws-a', { v: 'a' })
    await saveCanvas('ws-b', { v: 'b' })
    expect(await loadCanvas('ws-a')).toEqual({ v: 'a' })
    expect(await loadCanvas('ws-b')).toEqual({ v: 'b' })
  })

  it('sanitizes unsafe workspaceId characters in filename', async () => {
    await saveCanvas('ws/../../danger', { x: 1 })
    const files = await fs.readdir(root)
    expect(files.every((f) => !f.includes('..') && !f.includes('/'))).toBe(true)
  })

  it('rethrows non-ENOENT errors (e.g. corrupt JSON)', async () => {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, 'ws-bad.json'), '<<< not json >>>', 'utf8')
    await expect(loadCanvas('ws-bad')).rejects.toThrow()
  })
})
