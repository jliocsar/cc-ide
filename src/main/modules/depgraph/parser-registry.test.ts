import { describe, expect, it } from 'vitest'
import { ParserRegistry, defaultRegistry } from './parser-registry'
import type { LanguageParser } from './types'

const mockParser = (matches: (path: string) => boolean): LanguageParser => ({
  id: 'mock',
  matches,
  scan: async function* () { yield* [] },
  stop: () => {},
})

describe('ParserRegistry', () => {
  it('starts empty when constructed without parsers', () => {
    const r = new ParserRegistry()
    expect(r.all()).toHaveLength(0)
  })

  it('accepts initial parsers', () => {
    const p1 = mockParser(() => true)
    const r = new ParserRegistry([p1])
    expect(r.all()).toHaveLength(1)
  })

  it('registers additional parsers', () => {
    const p1 = mockParser(() => false)
    const p2 = mockParser(() => true)
    const r = new ParserRegistry([p1])
    r.register(p2)
    expect(r.all()).toHaveLength(2)
  })

  it('forPath returns first matching parser', () => {
    const p1 = mockParser((p) => p.endsWith('.ts'))
    const p2 = mockParser(() => true)
    const r = new ParserRegistry([p1, p2])
    expect(r.forPath('a.ts')?.id).toBe('mock')
    expect(r.forPath('a.ts')).toBe(p1)
  })

  it('forPath returns null when no parser matches', () => {
    const p1 = mockParser((p) => p.endsWith('.ts'))
    const r = new ParserRegistry([p1])
    expect(r.forPath('a.js')).toBeNull()
  })
})

describe('defaultRegistry', () => {
  it('contains TS parser', () => {
    const r = defaultRegistry()
    expect(r.forPath('src/a.ts')).not.toBeNull()
    expect(r.forPath('src/a.ts')?.id).toBe('ts')
  })
})