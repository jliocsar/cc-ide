import { describe, expect, it } from 'vitest'
import { extractFencedLangs, normalizeLang } from './highlight'

describe('normalizeLang', () => {
  it('returns null for empty/undefined', () => {
    expect(normalizeLang(undefined)).toBeNull()
    expect(normalizeLang('')).toBeNull()
  })

  it('maps common aliases', () => {
    expect(normalizeLang('ts')).toBe('typescript')
    expect(normalizeLang('js')).toBe('javascript')
    expect(normalizeLang('py')).toBe('python')
    expect(normalizeLang('rs')).toBe('rust')
    expect(normalizeLang('sh')).toBe('shell')
    expect(normalizeLang('bash')).toBe('shell')
    expect(normalizeLang('yml')).toBe('yaml')
  })

  it('returns null for unknown', () => {
    expect(normalizeLang('cobol')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(normalizeLang('TS')).toBe('typescript')
    expect(normalizeLang('Python')).toBe('python')
  })
})

describe('extractFencedLangs', () => {
  it('returns empty array for no fences', () => {
    expect(extractFencedLangs('hello world')).toEqual([])
  })

  it('extracts a single fence', () => {
    const md = '```ts\nconst x = 1\n```'
    expect(extractFencedLangs(md)).toEqual(['typescript'])
  })

  it('dedupes repeated langs', () => {
    const md = '```ts\na\n```\n\n```ts\nb\n```'
    expect(extractFencedLangs(md)).toEqual(['typescript'])
  })

  it('extracts multiple distinct langs', () => {
    const md = '```ts\na\n```\n\n```py\nb\n```\n\n```rust\nc\n```'
    const out = extractFencedLangs(md)
    expect(out.sort()).toEqual(['python', 'rust', 'typescript'])
  })

  it('handles tilde fences', () => {
    const md = '~~~go\nx := 1\n~~~'
    expect(extractFencedLangs(md)).toEqual(['go'])
  })

  it('ignores unknown langs', () => {
    const md = '```cobol\nMOVE ZEROS TO X\n```'
    expect(extractFencedLangs(md)).toEqual([])
  })

  it('strips info-string trailing args', () => {
    const md = '```ts title="foo.ts"\nconst x = 1\n```'
    expect(extractFencedLangs(md)).toEqual(['typescript'])
  })
})
