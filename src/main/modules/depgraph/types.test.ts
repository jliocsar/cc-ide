import { describe, expect, it } from 'vitest'
import { canonicalEdgeId, emptyWorkspaceGraphState } from './types'

describe('canonicalEdgeId', () => {
  it('creates key in from>>to format', () => {
    expect(canonicalEdgeId('a.ts', 'b.ts')).toBe('a.ts>>b.ts')
    expect(canonicalEdgeId('foo/bar.ts', 'baz/qux.ts')).toBe('foo/bar.ts>>baz/qux.ts')
  })
})

describe('emptyWorkspaceGraphState', () => {
  it('returns object with empty maps', () => {
    const state = emptyWorkspaceGraphState()
    expect(state.nodes).toBeInstanceOf(Map)
    expect(state.edges).toBeInstanceOf(Map)
    expect(state.incoming).toBeInstanceOf(Map)
    expect(state.outgoing).toBeInstanceOf(Map)
    expect(state.fileImports).toBeInstanceOf(Map)
    expect(state.nodes.size).toBe(0)
  })
})
