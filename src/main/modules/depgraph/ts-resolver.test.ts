import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { langFromPath, TsModuleResolver } from './ts-resolver'
import { TsconfigCascade } from './tsconfig-cascade'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ts-resolver-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('langFromPath', () => {
  it('classifies common extensions', () => {
    expect(langFromPath('a.ts')).toBe('ts')
    expect(langFromPath('a.tsx')).toBe('tsx')
    expect(langFromPath('a.jsx')).toBe('jsx')
    expect(langFromPath('a.js')).toBe('js')
    expect(langFromPath('a.mjs')).toBe('js')
    expect(langFromPath('a.cjs')).toBe('js')
    expect(langFromPath('a.d.ts')).toBe('dts')
    expect(langFromPath('a.json')).toBe('json')
    expect(langFromPath('a.css')).toBe('css')
    expect(langFromPath('a.scss')).toBe('css')
    expect(langFromPath('a.sass')).toBe('css')
    expect(langFromPath('Unknown.xyz')).toBe('ts')
  })
})

describe('TsModuleResolver', () => {
  it('resolves a relative asset import to an on-disk file', async () => {
    await fs.writeFile(join(root, 'styles.css'), '.a{}')
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: './styles.css',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.resolvedPath).toBe(join(root, 'styles.css'))
    expect(res?.lang).toBe('css')
  })

  it('returns null for a missing relative asset import', async () => {
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: './missing.css',
      containingFile: join(root, 'a.ts'),
    })
    expect(res).toBeNull()
  })

  it('falls back to naive resolution when ts.resolveModuleName fails', async () => {
    await fs.writeFile(join(root, 'b.ts'), 'export const b = 1')
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    // No tsconfig loaded — `./b` (no ext) falls through to naive lookup
    const res = await r.resolve({
      specifier: './b',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.resolvedPath).toBe(join(root, 'b.ts'))
  })

  it('resolves via index.ts naive fallback', async () => {
    await fs.mkdir(join(root, 'sub'), { recursive: true })
    await fs.writeFile(join(root, 'sub', 'index.ts'), 'export const x = 1')
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: './sub',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.resolvedPath).toBe(join(root, 'sub', 'index.ts'))
  })

  it('emits an external node for an unresolvable bare specifier', async () => {
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: 'no-such-pkg-1234',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.resolvedPath).toBeNull()
    expect(res?.packageName).toBe('no-such-pkg-1234')
    expect(res?.lang).toBe('external')
  })

  it('preserves scope when extracting package name', async () => {
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: '@scope/no-such-pkg-1234/sub',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.packageName).toBe('@scope/no-such-pkg-1234')
  })

  it('returns null for an unresolvable relative non-asset specifier', async () => {
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: './missing-module-no-ext',
      containingFile: join(root, 'a.ts'),
    })
    expect(res).toBeNull()
  })

  it('flags a resolved external library import (typescript) with packageName', async () => {
    // Run inside the cc-ide repo so ts.resolveModuleName can find typescript
    // in this project's node_modules.
    const containingFile = join(__dirname, 'a-fake-file.ts')
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: 'typescript',
      containingFile,
    })
    expect(res?.resolvedPath).toBeNull()
    expect(res?.packageName).toBe('typescript')
    expect(res?.lang).toBe('external')
  })

  it('returns just the scope when the bare scoped specifier has no slash', async () => {
    const cascade = new TsconfigCascade()
    const r = new TsModuleResolver(cascade)
    const res = await r.resolve({
      specifier: '@scopeonly',
      containingFile: join(root, 'a.ts'),
    })
    expect(res?.packageName).toBe('@scopeonly')
  })
})
