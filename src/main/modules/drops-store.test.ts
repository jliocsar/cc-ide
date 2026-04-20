import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DropEntryDTO } from '@shared/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __setDataDirForTests, listDrops, writeDrops } from './drops-store'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'drops-store-'))
  __setDataDirForTests(dir)
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

function entry(overrides?: Partial<DropEntryDTO>): DropEntryDTO {
  return {
    id: overrides?.id ?? 'id-1',
    workspaceId: overrides?.workspaceId ?? 'ws',
    relPath: overrides?.relPath ?? 'src/foo.ts',
    addedAt: overrides?.addedAt ?? 1,
  }
}

describe('drops-store', () => {
  it('returns [] when file does not exist', async () => {
    expect(await listDrops('nope')).toEqual([])
  })

  it('round-trips entries', async () => {
    const e1 = entry({ id: 'a', relPath: 'src/a.ts' })
    const e2 = entry({ id: 'b', relPath: 'src/b.ts', addedAt: 2 })
    await writeDrops('ws', [e1, e2])
    expect(await listDrops('ws')).toEqual([e1, e2])
  })

  it('overwrites on repeated writes', async () => {
    await writeDrops('ws', [entry({ id: 'a' })])
    await writeDrops('ws', [entry({ id: 'b' })])
    expect(await listDrops('ws')).toEqual([entry({ id: 'b' })])
  })

  it('treats corrupt file as empty', async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'ws.json'), 'not json at all{{{', 'utf8')
    expect(await listDrops('ws')).toEqual([])
  })

  it('treats invalid schema as empty', async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'ws.json'), '{"entries": [{"id": 123}]}', 'utf8')
    expect(await listDrops('ws')).toEqual([])
  })

  it('does not leak tmp files on successful write', async () => {
    await writeDrops('ws', [entry()])
    const files = await fs.readdir(dir)
    const tmps = files.filter((f) => f.includes('.tmp'))
    expect(tmps).toEqual([])
  })
})
