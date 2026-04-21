import { describe, expect, it, vi } from 'vitest'

// No tmux in CI. Only pure-function assertions; the mirror lifecycle is
// exercised at runtime via the live app.

vi.mock('../event-bus', () => ({ broadcast: () => {} }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { isNamedTmuxKey } from './teammate-mirror'

describe('isNamedTmuxKey', () => {
  it('1. accepts plain named keys', () => {
    expect(isNamedTmuxKey('Enter')).toBe(true)
    expect(isNamedTmuxKey('Escape')).toBe(true)
    expect(isNamedTmuxKey('Space')).toBe(true)
    expect(isNamedTmuxKey('Tab')).toBe(true)
    expect(isNamedTmuxKey('Up')).toBe(true)
    expect(isNamedTmuxKey('PageDown')).toBe(true)
    expect(isNamedTmuxKey('F1')).toBe(true)
    expect(isNamedTmuxKey('F12')).toBe(true)
  })

  it('2. accepts modifier-prefixed keys', () => {
    expect(isNamedTmuxKey('C-c')).toBe(true)
    expect(isNamedTmuxKey('C-d')).toBe(true)
    expect(isNamedTmuxKey('M-x')).toBe(true)
    expect(isNamedTmuxKey('S-F1')).toBe(true)
  })

  it('3. rejects arbitrary strings (prevents shell injection)', () => {
    expect(isNamedTmuxKey('Enter; rm -rf /')).toBe(false)
    expect(isNamedTmuxKey('$(whoami)')).toBe(false)
    expect(isNamedTmuxKey('`date`')).toBe(false)
    expect(isNamedTmuxKey('')).toBe(false)
    expect(isNamedTmuxKey('hello world')).toBe(false)
  })
})
