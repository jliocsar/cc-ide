import { describe, expect, it } from 'vitest'
import { sanityCheck } from './sanity'

describe('sanityCheck', () => {
  it('returns ok', () => {
    expect(sanityCheck()).toBe('ok')
  })
})
