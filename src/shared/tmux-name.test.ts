import { describe, expect, it } from 'vitest'
import { slugifyFirstMessage, validateTmuxWindowName } from './tmux-name'

describe('validateTmuxWindowName', () => {
  it('accepts normal names', () => {
    expect(validateTmuxWindowName('claude-oreo')).toEqual({ ok: true })
    expect(validateTmuxWindowName('my-session')).toEqual({ ok: true })
    expect(validateTmuxWindowName('a')).toEqual({ ok: true })
    expect(validateTmuxWindowName('a'.repeat(64))).toEqual({ ok: true })
  })

  it('rejects empty', () => {
    const r = validateTmuxWindowName('')
    expect(r.ok).toBe(false)
  })

  it('rejects > 64 chars', () => {
    const r = validateTmuxWindowName('a'.repeat(65))
    expect(r.ok).toBe(false)
  })

  it('rejects colons', () => {
    const r = validateTmuxWindowName('ccide:0')
    expect(r.ok).toBe(false)
  })

  it('rejects dots', () => {
    const r = validateTmuxWindowName('my.session')
    expect(r.ok).toBe(false)
  })

  it('rejects leading/trailing whitespace', () => {
    expect(validateTmuxWindowName(' foo').ok).toBe(false)
    expect(validateTmuxWindowName('foo ').ok).toBe(false)
    expect(validateTmuxWindowName(' foo ').ok).toBe(false)
  })

  it('accepts internal spaces (tmux allows them)', () => {
    expect(validateTmuxWindowName('hello world')).toEqual({ ok: true })
  })

  it('rejects reserved __ccide_idle__', () => {
    const r = validateTmuxWindowName('__ccide_idle__')
    expect(r.ok).toBe(false)
  })

  it('rejects non-string input defensively', () => {
    const r = validateTmuxWindowName(42 as unknown as string)
    expect(r.ok).toBe(false)
  })
})

describe('slugifyFirstMessage', () => {
  it('slugifies simple messages', () => {
    expect(slugifyFirstMessage('Fix the login bug')).toBe('fix-the-login-bug')
  })

  it('returns null for null/undefined/empty', () => {
    expect(slugifyFirstMessage(null)).toBe(null)
    expect(slugifyFirstMessage(undefined)).toBe(null)
    expect(slugifyFirstMessage('')).toBe(null)
  })

  it('strips unicode + emoji', () => {
    expect(slugifyFirstMessage('Fix bug 🐛 in auth')).toBe('fix-bug-in-auth')
    expect(slugifyFirstMessage('日本語 hello world')).toBe('hello-world')
  })

  it('truncates to 32 chars and trims trailing dashes', () => {
    const msg = 'a'.repeat(100)
    const slug = slugifyFirstMessage(msg)
    expect(slug).not.toBeNull()
    expect(slug!.length).toBeLessThanOrEqual(32)
  })

  it('does not leave trailing dash after truncation', () => {
    const msg = 'word-word-word-word-word-word-word-more'
    const slug = slugifyFirstMessage(msg)
    expect(slug).not.toBeNull()
    expect(slug!.endsWith('-')).toBe(false)
  })

  it('collapses whitespace', () => {
    expect(slugifyFirstMessage('hello    world   there')).toBe('hello-world-there')
  })

  it('collapses multiple dashes', () => {
    expect(slugifyFirstMessage('hello---world')).toBe('hello-world')
  })

  it('returns null if message is only special chars', () => {
    expect(slugifyFirstMessage('!@#$%^&*()')).toBe(null)
    expect(slugifyFirstMessage('   ')).toBe(null)
  })

  it('trims leading/trailing dashes', () => {
    expect(slugifyFirstMessage('-hello-world-')).toBe('hello-world')
  })
})
