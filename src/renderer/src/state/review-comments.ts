import { create } from 'zustand'

export type RangeDraft = {
  id: string
  start: number
  len: number
  comment: string
}

export const EMPTY_RANGES: readonly RangeDraft[] = Object.freeze([])

type State = {
  byTab: Record<string, RangeDraft[]>
  lastRangeId: Record<string, string | null>

  ranges: (tabId: string) => RangeDraft[]
  count: (tabId: string) => number
  commentedCount: (tabId: string) => number
  isLineInAnyRange: (tabId: string, line: number) => boolean
  rangeContaining: (tabId: string, line: number) => RangeDraft | null

  startSingle: (tabId: string, line: number) => string
  toggleLine: (tabId: string, line: number) => void
  extendLast: (tabId: string, line: number) => void
  setComment: (tabId: string, id: string, comment: string) => void
  removeRange: (tabId: string, id: string) => void
  clear: (tabId: string) => void
  setLast: (tabId: string, id: string | null) => void
  replaceAll: (tabId: string, next: RangeDraft[]) => void
}

function newId(): string {
  return crypto.randomUUID()
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
    return ranges.some((r) => line >= r.start && line <= r.start + r.len - 1)
  },

  rangeContaining(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    return ranges.find((r) => line >= r.start && line <= r.start + r.len - 1) ?? null
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

  toggleLine(tabId, line) {
    const ranges = get().byTab[tabId] ?? []
    const target = ranges.find((r) => line >= r.start && line <= r.start + r.len - 1)
    if (!target) return

    const end = target.start + target.len - 1

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

  extendLast(tabId, line) {
    const lastId = get().lastRangeId[tabId]
    const ranges = get().byTab[tabId] ?? []
    if (!lastId) {
      get().startSingle(tabId, line)
      return
    }
    const target = ranges.find((r) => r.id === lastId)
    if (!target) {
      get().startSingle(tabId, line)
      return
    }
    const oldEnd = target.start + target.len - 1
    const newStart = Math.min(target.start, line)
    const newEnd = Math.max(oldEnd, line)
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
