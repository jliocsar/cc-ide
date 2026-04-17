import { describe, expect, it } from 'vitest'
import { generateClaudeWindowName, slugify } from './cat-name-gen'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Mr. Whiskers')).toBe('mr-whiskers')
    expect(slugify('Oreo')).toBe('oreo')
    expect(slugify('  Fuzzy   Boots  ')).toBe('fuzzy-boots')
    expect(slugify("O'Malley")).toBe('o-malley')
  })
})

describe('generateClaudeWindowName', () => {
  it('returns claude-<slug> matching expected shape', async () => {
    const name = await generateClaudeWindowName('primary', {
      random: () => 'Oreo',
      listWindows: async () => [],
    })
    expect(name).toBe('claude-oreo')
    expect(name).toMatch(/^claude-[a-z0-9-]+$/)
  })

  it('falls back to a different random pick on collision', async () => {
    const picks = ['Oreo', 'Whiskers']
    let i = 0
    const name = await generateClaudeWindowName('primary', {
      random: () => picks[i++ % picks.length]!,
      listWindows: async () => ['claude-oreo'],
    })
    expect(name).toBe('claude-whiskers')
  })

  it('appends numeric suffix when every draw collides', async () => {
    const name = await generateClaudeWindowName('primary', {
      random: () => 'Oreo',
      listWindows: async () => ['claude-oreo'],
    })
    expect(name).toBe('claude-oreo-2')
  })

  it('appends suffix past 2 when -2 is also taken', async () => {
    const name = await generateClaudeWindowName('primary', {
      random: () => 'Oreo',
      listWindows: async () => ['claude-oreo', 'claude-oreo-2'],
    })
    expect(name).toBe('claude-oreo-3')
  })

  it('tolerates listWindows errors by treating existing as empty', async () => {
    const name = await generateClaudeWindowName('primary', {
      random: () => 'Oreo',
      listWindows: async () => {
        throw new Error('tmux boom')
      },
    })
    expect(name).toBe('claude-oreo')
  })
})
