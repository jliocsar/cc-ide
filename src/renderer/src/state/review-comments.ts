import { create } from 'zustand'

export type RangeDraft = {
  id: string
  start: number
  len: number
  comment: string
}

export const EMPTY_RANGES: readonly RangeDraft[] = Object.freeze([])

export type StartResult = { ok: true; id: string } | { ok: false; blockedRangeId: string }
export type ToggleResult = { ok: true } | { ok: false; blockedRangeId: string } | { ok: 'noop' }

type State = {
  byTab: Record<string, RangeDraft[]>
  lastRangeId: Record<string, string | null>

  ranges: (tabId: string) => RangeDraft[]
  count: (tabId: string) => number
  commentedCount: (tabId: string) => number
  isLineInAnyRange: (tabId: string, line: number) => boolean
  rangeContaining: (tabId: string, line: number) => RangeDraft | null

  startSingle: (tabId: string, line: number) => string
  attemptStart: (tabId: string, line: number) => StartResult
  toggleLine: (tabId: string, line: number) => void
  attemptToggle: (tabId: string, line: number) => ToggleResult
  extendLast: (tabId: string, line: number) => void
  setComment: (tabId: string, id: string, comment: string) => void
  removeRange: (tabId: string, id: string) => void
  restoreRange: (tabId: string, draft: RangeDraft) => void
  clear: (tabId: string) => void
  setLast: (tabId: string, id: string | null) => void
  replaceAll: (tabId: string, next: RangeDraft[]) => void
}

function newId(): string {
  return crypto.randomUUID()
}

function endOf(r: RangeDraft): number {
  return r.start + r.len - 1
}

function rangeAtLine(ranges: readonly RangeDraft[], line: number): RangeDraft | undefined {
  return ranges.find((r) => line >= r.start && line <= endOf(r))
}

export const useReviewComments = create<State>((set, get) => ({
  byTab: {},
  lastRangeId: {},

  ranges(tabId) {
    return get().byTab[tabId] ?? []
  },

  count(tabId) {
    return (get().byTab[tabId] ?? []).length
  },

  commentedCount(tabId) {
    return (get().byTab[tabId] ?? []).filter((r) => r.comment.trim().length > 0).length
  },

  isLineInAnyRange(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    return ranges.some((r) => line >= r.start && line <= endOf(r))
  },

  rangeContaining(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    return ranges.find((r) => line >= r.start && line <= endOf(r)) ?? null
  },

  startSingle(tabId, line) {
    const id = newId()
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: [...(s.byTab[tabId] ?? []), { id, start: line, len: 1, comment: '' }],
      },
      lastRangeId: { ...s.lastRangeId, [tabId]: id },
    }))
    return id
  },

  attemptStart(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    const existing = rangeAtLine(ranges, line)
    if (existing) return { ok: false, blockedRangeId: existing.id }
    return { ok: true, id: get().startSingle(tabId, line) }
  },

  toggleLine(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    const target = ranges.find((r) => line >= r.start && line <= endOf(r))
    if (!target) return

    const end = endOf(target)

    if (target.len === 1) {
      get().removeRange(tabId, target.id)
      return
    }

    if (line === target.start) {
      set((s) => ({
        byTab: {
          ...s.byTab,
          [tabId]: (s.byTab[tabId] ?? []).map((r) =>
            r.id === target.id ? { ...r, start: r.start + 1, len: r.len - 1 } : r,
          ),
        },
      }))
      return
    }

    if (line === end) {
      set((s) => ({
        byTab: {
          ...s.byTab,
          [tabId]: (s.byTab[tabId] ?? []).map((r) =>
            r.id === target.id ? { ...r, len: r.len - 1 } : r,
          ),
        },
      }))
      return
    }

    const leftLen = line - target.start
    const rightStart = line + 1
    const rightLen = end - line
    const rightId = newId()
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: [
          ...(s.byTab[tabId] ?? []).map((r) => (r.id === target.id ? { ...r, len: leftLen } : r)),
          { id: rightId, start: rightStart, len: rightLen, comment: '' },
        ],
      },
    }))
  },

  attemptToggle(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    const target = ranges.find((r) => line >= r.start && line <= endOf(r))
    if (!target) return { ok: 'noop' }
    if (target.comment.trim().length > 0) return { ok: false, blockedRangeId: target.id }
    get().toggleLine(tabId, line)
    return { ok: true }
  },

  extendLast(tabId, line) {
    const lastId = get().lastRangeId[tabId]
    const ranges = get().byTab[tabId] ?? []
    if (!lastId) {
      // Defensive: only create here if this line isn't already inside another
      // range. attemptStart enforces overlap rules; bare startSingle would skip.
      const existing = rangeAtLine(ranges, line)
      if (existing) return
      get().startSingle(tabId, line)
      return
    }
    const target = ranges.find((r) => r.id === lastId)
    if (!target) {
      const existing = rangeAtLine(ranges, line)
      if (existing) return
      get().startSingle(tabId, line)
      return
    }
    const oldEnd = endOf(target)
    let newStart = Math.min(target.start, line)
    let newEnd = Math.max(oldEnd, line)

    // Clamp against other ranges so the extended range never overlaps one.
    // Upward extension: stop at end-of-nearest-other-above + 1.
    // Downward extension: stop at start-of-nearest-other-below - 1.
    for (const other of ranges) {
      if (other.id === target.id) continue
      const oEnd = endOf(other)
      if (oEnd < target.start && oEnd >= newStart) {
        newStart = Math.max(newStart, oEnd + 1)
      }
      if (other.start > oldEnd && other.start <= newEnd) {
        newEnd = Math.min(newEnd, other.start - 1)
      }
    }

    if (newEnd < newStart) return
    if (newStart === target.start && newEnd === oldEnd) return
    const newLen = newEnd - newStart + 1
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: (s.byTab[tabId] ?? []).map((r) =>
          r.id === lastId ? { ...r, start: newStart, len: newLen } : r,
        ),
      },
    }))
  },

  setComment(tabId, id, comment) {
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: (s.byTab[tabId] ?? []).map((r) => (r.id === id ? { ...r, comment } : r)),
      },
    }))
  },

  removeRange(tabId, id) {
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: (s.byTab[tabId] ?? []).filter((r) => r.id !== id),
      },
      lastRangeId: {
        ...s.lastRangeId,
        [tabId]: s.lastRangeId[tabId] === id ? null : (s.lastRangeId[tabId] ?? null),
      },
    }))
  },

  restoreRange(tabId, draft) {
    set((s) => {
      const existing = s.byTab[tabId] ?? []
      if (existing.some((r) => r.id === draft.id)) return s
      const docMaxLine = Number.MAX_SAFE_INTEGER
      const safeStart = Math.max(1, Math.min(draft.start, docMaxLine))
      const restored: RangeDraft = { ...draft, start: safeStart, len: 1 }
      // Clamp to first non-overlapping line at or after safeStart.
      const ends = existing
        .map((r) => endOf(r))
        .filter((e) => e >= safeStart)
        .sort((a, b) => a - b)
      let candidate = safeStart
      for (const e of ends) {
        if (existing.some((r) => candidate >= r.start && candidate <= endOf(r))) {
          candidate = e + 1
        }
      }
      restored.start = candidate
      return {
        byTab: { ...s.byTab, [tabId]: [...existing, restored] },
      }
    })
  },

  clear(tabId) {
    set((s) => {
      const { [tabId]: _r, ...byTab } = s.byTab
      const { [tabId]: _l, ...lastRangeId } = s.lastRangeId
      return { byTab, lastRangeId }
    })
  },

  setLast(tabId, id) {
    set((s) => ({ lastRangeId: { ...s.lastRangeId, [tabId]: id } }))
  },

  replaceAll(tabId, next) {
    set((s) => {
      const stillExists = next.some((r) => r.id === s.lastRangeId[tabId])
      return {
        byTab: { ...s.byTab, [tabId]: next },
        lastRangeId: {
          ...s.lastRangeId,
          [tabId]: stillExists ? (s.lastRangeId[tabId] ?? null) : null,
        },
      }
    })
  },
}))

export function planTabId(workspaceId: string, relPath: string): string {
  return `plan:${workspaceId}:${relPath}`
}

export function diffTabId(worktreePath: string, path: string, stage: string): string {
  return `diff:${worktreePath}:${stage}:${path}`
}
