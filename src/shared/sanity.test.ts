import { describe, expect, it } from 'vitest'
import { sanityCheck } from './sanity'

describe('sanityCheck', () => {
  it('returns ok', () => {
    expect(sanityCheck()).toBe('ok')
  })
})
// shiki smoke test
export function __smokeTest(): string {
  const greeting: string = `hello, ${String('world')}`
  return greeting
}
