import { describe, it, expect } from 'vitest'
import { ChangeSet, Text } from '@codemirror/state'
import { mapRanges, type LineRange } from './review-range-map'

function r(id: string, start: number, len: number, comment = ''): LineRange {
  return { id, start, len, comment }
}

function applyInsert(
  oldDoc: Text,
  pos: number,
  inserted: string,
): {
  changes: ChangeSet
  newDoc: Text
} {
  const changes = ChangeSet.of({ from: pos, insert: inserted }, oldDoc.length)
  const newDoc = changes.apply(oldDoc)
  return { changes, newDoc }
}

function applyDelete(
  oldDoc: Text,
  from: number,
  to: number,
): {
  changes: ChangeSet
  newDoc: Text
} {
  const changes = ChangeSet.of({ from, to }, oldDoc.length)
  const newDoc = changes.apply(oldDoc)
  return { changes, newDoc }
}

function applyReplace(
  oldDoc: Text,
  from: number,
  to: number,
  inserted: string,
): { changes: ChangeSet; newDoc: Text } {
  const changes = ChangeSet.of({ from, to, insert: inserted }, oldDoc.length)
  const newDoc = changes.apply(oldDoc)
  return { changes, newDoc }
}

describe('mapRanges', () => {
  it('1. insert above shifts range down', () => {
    const oldDoc = Text.of(['line1', 'line2', 'line3', 'line4', 'line5'])
    // Range covering lines 3-4.
    const range = r('a', 3, 2)
    // Insert two new lines at the very top.
    const { changes, newDoc } = applyInsert(oldDoc, 0, 'new1\nnew2\n')
    const [mapped] = mapRanges([range], oldDoc, changes, newDoc)
    expect(mapped).toBeDefined()
    expect(mapped!.start).toBe(5)
    expect(mapped!.len).toBe(2)
  })

  it('2. insert below does not affect range', () => {
    const oldDoc = Text.of(['line1', 'line2', 'line3', 'line4'])
    const range = r('a', 2, 2) // lines 2-3
    const { changes, newDoc } = applyInsert(oldDoc, oldDoc.length, '\nnew')
    const [mapped] = mapRanges([range], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(2)
    expect(mapped!.len).toBe(2)
  })

  it('3. delete one of three range lines shrinks to two', () => {
    const oldDoc = Text.of(['L1', 'L2', 'L3', 'L4', 'L5'])
    // Range covers L2-L4 (lines 2-4).
    const range = r('a', 2, 3)
    // Delete the middle line L3 (including its trailing newline).
    const l3 = oldDoc.line(3)
    const { changes, newDoc } = applyDelete(oldDoc, l3.from, l3.to + 1)
    const [mapped] = mapRanges([range], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(2)
    expect(mapped!.len).toBe(2)
  })

  it('4. deleting all lines in range drops the range', () => {
    const oldDoc = Text.of(['L1', 'L2', 'L3', 'L4'])
    const range = r('a', 2, 2) // L2-L3
    const l2 = oldDoc.line(2)
    const l3 = oldDoc.line(3)
    const { changes, newDoc } = applyDelete(oldDoc, l2.from, l3.to + 1)
    const mapped = mapRanges([range], oldDoc, changes, newDoc)
    expect(mapped).toEqual([])
  })

  it('5. insert inside range extends len only if insertion adds lines', () => {
    const oldDoc = Text.of(['L1', 'L2', 'L3'])
    const range = r('a', 2, 1) // just L2
    // Insert a newline in the middle of L2 — splits it into two lines.
    const l2 = oldDoc.line(2)
    const mid = l2.from + 1 // after first character
    const { changes, newDoc } = applyInsert(oldDoc, mid, '\nX')
    const [mapped] = mapRanges([range], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(2)
    // The original single line is now spread across lines 2-3 (L prefix + \nX + 2 suffix).
    expect(mapped!.len).toBeGreaterThanOrEqual(2)
  })

  it('6. insert above and delete below leaves middle range stable in content', () => {
    const oldDoc = Text.of(['A', 'B', 'C', 'D', 'E'])
    const rng = r('a', 3, 1) // line 'C'
    // Insert one line at top AND delete last line — multi-hunk.
    const eFrom = oldDoc.line(5).from
    const changes = ChangeSet.of(
      [
        { from: 0, insert: 'Z\n' },
        { from: eFrom, to: oldDoc.length },
      ],
      oldDoc.length,
    )
    const newDoc = changes.apply(oldDoc)
    const [mapped] = mapRanges([rng], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(4) // Z + A B C -> C is line 4
    expect(mapped!.len).toBe(1)
  })

  it('7. preserves comment text', () => {
    const oldDoc = Text.of(['L1', 'L2'])
    const rng = r('a', 1, 1, 'keep this note')
    const { changes, newDoc } = applyInsert(oldDoc, 0, 'X\n')
    const [mapped] = mapRanges([rng], oldDoc, changes, newDoc)
    expect(mapped!.comment).toBe('keep this note')
    expect(mapped!.id).toBe('a')
  })

  it('8. multi-range, mixed shifts', () => {
    const oldDoc = Text.of(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    const ranges: LineRange[] = [
      r('top', 2, 1), // B
      r('mid', 4, 2), // D, E
      r('bot', 7, 1), // G
    ]
    // Insert a line above B (before 'B'): between A and B.
    const bLine = oldDoc.line(2)
    const { changes, newDoc } = applyInsert(oldDoc, bLine.from, 'X\n')
    const mapped = mapRanges(ranges, oldDoc, changes, newDoc)
    expect(mapped).toHaveLength(3)
    // Now doc is: A X B C D E F G.
    expect(mapped.find((m) => m.id === 'top')!.start).toBe(3)
    expect(mapped.find((m) => m.id === 'mid')!.start).toBe(5)
    expect(mapped.find((m) => m.id === 'mid')!.len).toBe(2)
    expect(mapped.find((m) => m.id === 'bot')!.start).toBe(8)
  })

  it('9. replacing range with shorter text collapses len correctly', () => {
    const oldDoc = Text.of(['L1', 'L2', 'L3', 'L4'])
    const rng = r('a', 2, 2) // L2-L3
    // Replace L2-L3 (two lines) with a single line.
    const l2 = oldDoc.line(2)
    const l3 = oldDoc.line(3)
    const { changes, newDoc } = applyReplace(oldDoc, l2.from, l3.to, 'only')
    const [mapped] = mapRanges([rng], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(2)
    expect(mapped!.len).toBe(1)
  })

  it('10. range at doc boundary survives append', () => {
    const oldDoc = Text.of(['only'])
    const rng = r('a', 1, 1)
    const { changes, newDoc } = applyInsert(oldDoc, oldDoc.length, '\nmore')
    const [mapped] = mapRanges([rng], oldDoc, changes, newDoc)
    expect(mapped!.start).toBe(1)
    expect(mapped!.len).toBe(1)
  })
})
