import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TsParser } from './ts-parser'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ts-parser-'))
  await gitInit(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function gitInit(path: string): Promise<void> {
  await run('git', ['-C', path, 'init', '-q'])
  await run('git', ['-C', path, 'config', 'user.email', 'test@test.dev'])
  await run('git', ['-C', path, 'config', 'user.name', 'test'])
}

async function write(rel: string, content: string): Promise<void> {
  const abs = join(root, rel)
  await fs.mkdir(join(abs, '..'), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  await run('git', ['-C', root, 'add', rel])
}

async function commit(): Promise<void> {
  await run('git', ['-C', root, 'commit', '-q', '-m', 'x'])
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' })
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    p.on('error', reject)
  })
}

async function collectScan(parser: TsParser): Promise<{
  nodes: string[]
  edges: { from: string; to: string; kinds: string[] }[]
}> {
  const nodes: string[] = []
  const edges: { from: string; to: string; kinds: string[] }[] = []
  for await (const delta of parser.scan(root)) {
    for (const n of delta.addNodes ?? []) nodes.push(n.id)
    for (const e of delta.addEdges ?? []) edges.push(e)
  }
  return { nodes, edges }
}

describe('TsParser.matches', () => {
  it('accepts ts/tsx/jsx/js/mjs/cjs', () => {
    const p = new TsParser()
    expect(p.matches('a.ts')).toBe(true)
    expect(p.matches('a.tsx')).toBe(true)
    expect(p.matches('a.jsx')).toBe(true)
    expect(p.matches('a.js')).toBe(true)
    expect(p.matches('a.mjs')).toBe(true)
    expect(p.matches('a.cjs')).toBe(true)
    expect(p.matches('a.d.ts')).toBe(true)
  })
  it('rejects non-TS files', () => {
    const p = new TsParser()
    expect(p.matches('a.txt')).toBe(false)
    expect(p.matches('README.md')).toBe(false)
    expect(p.matches('a.json')).toBe(false)
  })
})

describe('TsParser.scan', () => {
  it('discovers nodes and static edges', async () => {
    await write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.' } }))
    await write('a.ts', `import { b } from './b'\nexport const a = b + 1\n`)
    await write('b.ts', `export const b = 1\n`)
    await commit()

    const parser = new TsParser()
    const { nodes, edges } = await collectScan(parser)

    expect(nodes.sort()).toEqual(['a.ts', 'b.ts'])
    expect(edges).toContainEqual({ from: 'a.ts', to: 'b.ts', kinds: ['static'] })
  })

  it('tags type-only imports', async () => {
    await write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    await write('a.ts', `import type { X } from './b'\nexport const a: X = {} as X\n`)
    await write('b.ts', `export interface X { n: number }\n`)
    await commit()

    const parser = new TsParser()
    const { edges } = await collectScan(parser)
    expect(edges).toContainEqual({ from: 'a.ts', to: 'b.ts', kinds: ['type'] })
  })

  it('tags dynamic imports', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `export async function load() { return import('./b') }\n`)
    await write('b.ts', `export const b = 1\n`)
    await commit()

    const parser = new TsParser()
    const { edges } = await collectScan(parser)
    expect(edges.find((e) => e.from === 'a.ts' && e.to === 'b.ts')?.kinds).toEqual(['dynamic'])
  })

  it('tags re-exports', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `export * from './b'\n`)
    await write('b.ts', `export const b = 1\n`)
    await commit()

    const parser = new TsParser()
    const { edges } = await collectScan(parser)
    expect(edges.find((e) => e.from === 'a.ts' && e.to === 'b.ts')?.kinds).toEqual(['reexport'])
  })

  it('skips unresolvable imports silently', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `import x from './does-not-exist'\nexport const a = x\n`)
    await commit()

    const parser = new TsParser()
    const { nodes, edges } = await collectScan(parser)
    expect(nodes).toEqual(['a.ts'])
    expect(edges).toEqual([])
  })

  it('honors tsconfig paths', async () => {
    await write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['src/*'] },
        },
      }),
    )
    await write('src/a.ts', `import { b } from '@/b'\nexport const a = b\n`)
    await write('src/b.ts', `export const b = 1\n`)
    await commit()

    const parser = new TsParser()
    const { edges } = await collectScan(parser)
    expect(edges).toContainEqual({
      from: 'src/a.ts',
      to: 'src/b.ts',
      kinds: ['static'],
    })
  })

  it('emits external nodes for node_modules imports', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `import x from 'some-external-pkg'\nexport const a = x\n`)
    await commit()

    const parser = new TsParser()
    const { nodes, edges } = await collectScan(parser)
    expect(nodes.some((n) => n === 'external:some-external-pkg')).toBe(true)
    expect(
      edges.find((e) => e.from === 'a.ts' && e.to === 'external:some-external-pkg'),
    ).toBeTruthy()
  })

  it('tags asset imports', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `import './styles.css'\nexport const a = 1\n`)
    await write('styles.css', `.foo{}\n`)
    await commit()

    const parser = new TsParser()
    const { edges } = await collectScan(parser)
    expect(edges.find((e) => e.from === 'a.ts' && e.to === 'styles.css')?.kinds).toEqual(['asset'])
  })
})

describe('TsParser.onFileChange', () => {
  it('emits add/remove/update deltas reflecting diff', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `import { b } from './b'\nexport const a = b\n`)
    await write('b.ts', `export const b = 1\n`)
    await write('c.ts', `export const c = 2\n`)
    await commit()

    const parser = new TsParser()
    await collectScan(parser)

    // rewrite a.ts to import c instead of b
    const absA = join(root, 'a.ts')
    await fs.writeFile(absA, `import { c } from './c'\nexport const a = c\n`)
    const delta = await parser.onFileChange(absA, root)
    expect(delta).toBeTruthy()
    expect(delta?.addEdges).toContainEqual({
      from: 'a.ts',
      to: 'c.ts',
      kinds: ['static'],
    })
    expect(delta?.removeEdges).toContainEqual({ from: 'a.ts', to: 'b.ts' })
  })

  it('returns null for no-op save', async () => {
    await write('tsconfig.json', JSON.stringify({}))
    await write('a.ts', `import { b } from './b'\nexport const a = b\n`)
    await write('b.ts', `export const b = 1\n`)
    await commit()

    const parser = new TsParser()
    await collectScan(parser)

    const absA = join(root, 'a.ts')
    // rewrite with identical content
    await fs.writeFile(absA, `import { b } from './b'\nexport const a = b\n`)
    const delta = await parser.onFileChange(absA, root)
    expect(delta).toBeNull()
  })
})
