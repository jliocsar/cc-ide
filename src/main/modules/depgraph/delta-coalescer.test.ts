import { describe, expect, it } from 'vitest'
import { DeltaCoalescer } from './delta-coalescer'

describe('DeltaCoalescer', () => {
  it('starts empty', () => {
    const c = new DeltaCoalescer()
    expect(c.isEmpty()).toBe(true)
    expect(c.flush()).toBeNull()
  })

  it('coalesces addNodes', () => {
    const c = new DeltaCoalescer()
    c.add({ addNodes: [{ id: 'a.ts', kind: 'file', lang: 'typescript' }] })
    expect(c.isEmpty()).toBe(false)
    const delta = c.flush()
    expect(delta).not.toBeNull()
    expect(delta!.addNodes).toHaveLength(1)
    expect(delta!.addNodes![0]!.id).toBe('a.ts')
    expect(c.isEmpty()).toBe(true)
  })

  it('coalesces removeNodes', () => {
    const c = new DeltaCoalescer()
    c.add({ removeNodes: ['a.ts'] })
    const delta = c.flush()
    expect(delta!.removeNodes).toEqual(['a.ts'])
  })

  it('coalesces addEdges', () => {
    const c = new DeltaCoalescer()
    c.add({ addEdges: [{ from: 'a.ts', to: 'b.ts', kinds: ['import'] }] })
    const delta = c.flush()
    expect(delta!.addEdges).toHaveLength(1)
    expect(delta!.addEdges![0]!.from).toBe('a.ts')
  })

  it('coalesces removeEdges', () => {
    const c = new DeltaCoalescer()
    c.add({ removeEdges: [{ from: 'a.ts', to: 'b.ts' }] })
    const delta = c.flush()
    expect(delta!.removeEdges).toHaveLength(1)
  })

  it('coalesces updateEdgeKinds', () => {
    const c = new DeltaCoalescer()
    c.add({ updateEdgeKinds: [{ from: 'a.ts', to: 'b.ts', kinds: ['import', 'type'] }] })
    const delta = c.flush()
    expect(delta!.updateEdgeKinds).toHaveLength(1)
    expect(delta!.updateEdgeKinds![0]!.kinds).toEqual(['import', 'type'])
  })

  it('removes node before adding same node', () => {
    const c = new DeltaCoalescer()
    c.add({ removeNodes: ['a.ts'] })
    c.add({ addNodes: [{ id: 'a.ts', kind: 'file', lang: 'typescript' }] })
    const delta = c.flush()
    expect(delta!.removeNodes).toBeUndefined()
    expect(delta!.addNodes).toHaveLength(1)
    expect(delta!.addNodes![0]!.id).toBe('a.ts')
  })

  it('removes edge before adding same edge', () => {
    const c = new DeltaCoalescer()
    c.add({ removeEdges: [{ from: 'a.ts', to: 'b.ts' }] })
    c.add({ addEdges: [{ from: 'a.ts', to: 'b.ts', kinds: ['import'] }] })
    const delta = c.flush()
    expect(delta!.removeEdges).toBeUndefined()
    expect(delta!.addEdges).toHaveLength(1)
  })

  it('folds updateEdgeKinds into pending addEdges', () => {
    const c = new DeltaCoalescer()
    c.add({ addEdges: [{ from: 'a.ts', to: 'b.ts', kinds: ['import'] }] })
    c.add({ updateEdgeKinds: [{ from: 'a.ts', to: 'b.ts', kinds: ['import', 'type'] }] })
    const delta = c.flush()
    expect(delta!.updateEdgeKinds).toBeUndefined()
    expect(delta!.addEdges![0]!.kinds).toEqual(['import', 'type'])
  })

  it('handles multiple deltas in one frame', () => {
    const c = new DeltaCoalescer()
    c.add({ addNodes: [{ id: 'a.ts', kind: 'file', lang: 'typescript' }] })
    c.add({ addNodes: [{ id: 'b.ts', kind: 'file', lang: 'typescript' }] })
    c.add({ addEdges: [{ from: 'a.ts', to: 'b.ts', kinds: ['import'] }] })
    const delta = c.flush()
    expect(delta!.addNodes).toHaveLength(2)
    expect(delta!.addEdges).toHaveLength(1)
  })

  it('clears after flush', () => {
    const c = new DeltaCoalescer()
    c.add({ addNodes: [{ id: 'a.ts', kind: 'file', lang: 'typescript' }] })
    c.flush()
    expect(c.isEmpty()).toBe(true)
    expect(c.flush()).toBeNull()
  })
})
