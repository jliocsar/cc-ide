import type { ChangeSet, Text } from '@codemirror/state'

export type LineRange = {
  id: string
  start: number
  len: number
  comment: string
}

/**
 * Map an array of line-based ranges through a CM6 ChangeSet.
 *
 * For each range we:
 *   1. Convert its line span (start..start+len-1) to character offsets in oldDoc.
 *   2. Map those offsets through the ChangeSet.
 *   3. Convert the mapped offsets back to line numbers in the newDoc.
 *
 * Ranges that collapse to zero length (e.g. all their lines were deleted)
 * are dropped. Comments are preserved.
 */
export function mapRanges<T extends LineRange>(
  ranges: readonly T[],
  oldDoc: Text,
  changes: ChangeSet,
  newDoc: Text,
): T[] {
  const out: T[] = []
  for (const r of ranges) {
    const mapped = mapOneRange(r, oldDoc, changes, newDoc)
    if (mapped) out.push(mapped)
  }
  return out
}

function mapOneRange<T extends LineRange>(
  r: T,
  oldDoc: Text,
  changes: ChangeSet,
  newDoc: Text,
): T | null {
  const oldLines = oldDoc.lines
  const rawStart = Math.max(1, Math.min(r.start, oldLines))
  const rawEnd = Math.max(rawStart, Math.min(r.start + r.len - 1, oldLines))

  const oldStartPos = oldDoc.line(rawStart).from
  const oldEndPos = oldDoc.line(rawEnd).to

  // Map the start position with assoc=1 so insertions at the exact start
  // boundary (inserting text above) push the anchor forward, keeping the
  // range locked to its own first line rather than to the newly-inserted one.
  const newStartPos = changes.mapPos(oldStartPos, 1)
  // Map the end position with assoc=-1 so insertions at the exact end
  // boundary (typing a newline after the range) do NOT grow the range to
  // include the new line.
  const newEndPos = changes.mapPos(oldEndPos, -1)

  if (newEndPos <= newStartPos) return null

  const newStartLine = newDoc.lineAt(newStartPos).number
  const newEndLine = newDoc.lineAt(Math.min(newEndPos, newDoc.length)).number
  if (newEndLine < newStartLine) return null

  const newLen = newEndLine - newStartLine + 1
  if (newLen <= 0) return null

  return {
    ...r,
    start: newStartLine,
    len: newLen,
  }
}
