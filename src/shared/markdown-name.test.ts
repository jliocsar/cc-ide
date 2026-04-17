import { describe, expect, it } from 'vitest'
import { validateFolderName, validateMarkdownFilename } from './markdown-name'

describe('validateMarkdownFilename', () => {
  it('accepts a basic .md filename', () => {
    expect(validateMarkdownFilename('foo.md')).toEqual({ ok: true })
  })
  it('accepts capitalized .MD as valid (case-insensitive)', () => {
    expect(validateMarkdownFilename('Foo.MD')).toEqual({ ok: true })
  })
  it('accepts a name with spaces', () => {
    expect(validateMarkdownFilename('My Plan.md')).toEqual({ ok: true })
  })
  it('rejects an empty name', () => {
    expect(validateMarkdownFilename('')).toEqual({ ok: false, reason: 'name is required' })
    expect(validateMarkdownFilename('   ')).toEqual({ ok: false, reason: 'name is required' })
  })
  it('rejects names without .md extension', () => {
    expect(validateMarkdownFilename('foo')).toEqual({ ok: false, reason: 'must end in .md' })
    expect(validateMarkdownFilename('foo.txt')).toEqual({ ok: false, reason: 'must end in .md' })
    expect(validateMarkdownFilename('foo.markdown')).toEqual({
      ok: false,
      reason: 'must end in .md',
    })
  })
  it('rejects ".md" alone with no stem', () => {
    expect(validateMarkdownFilename('.md')).toEqual({
      ok: false,
      reason: 'name before .md is required',
    })
  })
  it('rejects names containing a slash', () => {
    expect(validateMarkdownFilename('foo/bar.md')).toEqual({
      ok: false,
      reason: 'no slashes in filename',
    })
  })
})

describe('validateFolderName', () => {
  it('accepts a basic folder name', () => {
    expect(validateFolderName('docs')).toEqual({ ok: true })
  })
  it('accepts a folder with spaces', () => {
    expect(validateFolderName('My Folder')).toEqual({ ok: true })
  })
  it('rejects empty', () => {
    expect(validateFolderName('  ')).toEqual({ ok: false, reason: 'name is required' })
  })
  it('rejects slashes', () => {
    expect(validateFolderName('a/b')).toEqual({ ok: false, reason: 'no slashes in folder name' })
  })
})
