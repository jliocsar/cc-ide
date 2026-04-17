import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TsconfigCascade, filterTsconfigCandidates } from './tsconfig-cascade'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'tsconfig-cascade-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(rel: string, content: string): Promise<void> {
  const abs = join(root, rel)
  await fs.mkdir(join(abs, '..'), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
}

describe('filterTsconfigCandidates', () => {
  it('matches tsconfig.json + variants', () => {
    expect(
      filterTsconfigCandidates([
        'tsconfig.json',
        'tsconfig.node.json',
        'tsconfig.base.json',
        'packages/a/tsconfig.json',
        'README.md',
        'src/tsconfig.txt',
      ]),
    ).toEqual([
      'tsconfig.json',
      'tsconfig.node.json',
      'tsconfig.base.json',
      'packages/a/tsconfig.json',
    ])
  })
})

describe('nearest ancestor', () => {
  it('returns root tsconfig for a file under root', async () => {
    await write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    const cascade = new TsconfigCascade()
    await cascade.load(root, ['tsconfig.json'])
    const nearest = cascade.nearest(join(root, 'src', 'foo.ts'))
    expect(nearest?.tsconfigPath).toBe(join(root, 'tsconfig.json'))
  })

  it('prefers a nested tsconfig over the root', async () => {
    await write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    await write('packages/a/tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.' } }))
    const cascade = new TsconfigCascade()
    await cascade.load(root, ['tsconfig.json', 'packages/a/tsconfig.json'])
    const nested = cascade.nearest(join(root, 'packages/a/src/x.ts'))
    expect(nested?.tsconfigPath).toBe(join(root, 'packages/a/tsconfig.json'))
    const topLevel = cascade.nearest(join(root, 'src/x.ts'))
    expect(topLevel?.tsconfigPath).toBe(join(root, 'tsconfig.json'))
  })

  it('returns null when no tsconfig is ancestor of the file', async () => {
    await write('packages/a/tsconfig.json', JSON.stringify({}))
    const cascade = new TsconfigCascade()
    await cascade.load(root, ['packages/a/tsconfig.json'])
    const none = cascade.nearest(join(root, 'other/x.ts'))
    expect(none).toBeNull()
  })

  it('reload updates the entry', async () => {
    await write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    const cascade = new TsconfigCascade()
    await cascade.load(root, ['tsconfig.json'])
    await write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }))
    await cascade.reload(join(root, 'tsconfig.json'))
    const entry = cascade.nearest(join(root, 'src/x.ts'))
    expect(entry?.options.strict).toBe(true)
  })
})
