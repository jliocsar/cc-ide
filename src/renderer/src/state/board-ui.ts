import { create } from 'zustand'
import type { Camera } from './canvas'
import type { EdgeKind } from './depgraph'

export type BoardMode = 'sessions' | 'graph' | 'sandbox'

// Sandbox is a dev-only mode. If a prod build boots with a persisted
// sandbox selection, fall back to sessions so the canvas isn't blank.
export function resolveBoardMode(mode: BoardMode | undefined): BoardMode {
  if (!mode) return 'sessions'
  if (mode === 'sandbox' && !import.meta.env.DEV) return 'sessions'
  return mode
}

export type NodeSizeMode = 'fixed' | 'degree' | 'loc'
export type NodeColorMode = 'folder' | 'filetype' | 'uniform'
export type LabelsMode = 'always' | 'hover' | 'zoom'

export interface GraphFilters {
  minInDegree: number
  minOutDegree: number
  showExternals: boolean
  edgeKinds: ReadonlySet<EdgeKind>
  pathInclude: string | null
  pathExclude: string | null
  neighborhoodDepth: number
}

export interface GraphStyle {
  mergedEdges: boolean
  nodeSize: NodeSizeMode
  nodeColor: NodeColorMode
  labels: LabelsMode
}

export const ALL_EDGE_KINDS: ReadonlySet<EdgeKind> = Object.freeze(
  new Set<EdgeKind>(['static', 'type', 'dynamic', 'reexport', 'asset']),
) as ReadonlySet<EdgeKind>

// Module-level frozen singletons. These are the stable fallbacks for selectors
// so every render returns the same object reference when no workspace-specific
// value has been stored yet. Returning a fresh default from a selector would
// thrash zustand and trigger the "Maximum update depth exceeded" loop that
// .claude/rules/state-patterns.md calls out.
export const DEFAULT_FILTERS: GraphFilters = Object.freeze({
  minInDegree: 0,
  minOutDegree: 0,
  showExternals: false,
  edgeKinds: ALL_EDGE_KINDS,
  pathInclude: null,
  pathExclude: null,
  neighborhoodDepth: 1,
}) as GraphFilters

export const DEFAULT_STYLE: GraphStyle = Object.freeze({
  mergedEdges: true,
  nodeSize: 'degree',
  nodeColor: 'folder',
  labels: 'zoom',
}) as GraphStyle

export const DEFAULT_CAMERA: Camera = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
}) as Camera

interface BoardUiState {
  modeByWorkspace: Record<string, BoardMode>
  railCollapsedByWorkspace: Record<string, boolean>
  filtersByWorkspace: Record<string, GraphFilters>
  styleByWorkspace: Record<string, GraphStyle>
  graphCameraByWorkspace: Record<string, Camera>
  selectedNodeByWorkspace: Record<string, string | null>

  setMode: (workspaceId: string, mode: BoardMode) => void
  getMode: (workspaceId: string) => BoardMode
  toggleRail: (workspaceId: string) => void
  setRailCollapsed: (workspaceId: string, collapsed: boolean) => void
  setFilters: (workspaceId: string, patch: Partial<GraphFilters>) => void
  setStyle: (workspaceId: string, patch: Partial<GraphStyle>) => void
  setGraphCamera: (workspaceId: string, camera: Camera) => void
  selectNode: (workspaceId: string, nodeId: string | null) => void
  clearWorkspace: (workspaceId: string) => void
}

export const useBoardUi = create<BoardUiState>((set, get) => ({
  modeByWorkspace: {},
  railCollapsedByWorkspace: {},
  filtersByWorkspace: {},
  styleByWorkspace: {},
  graphCameraByWorkspace: {},
  selectedNodeByWorkspace: {},

  setMode: (workspaceId, mode) =>
    set((s) => ({
      modeByWorkspace: { ...s.modeByWorkspace, [workspaceId]: mode },
    })),

  getMode: (workspaceId) => resolveBoardMode(get().modeByWorkspace[workspaceId]),

  toggleRail: (workspaceId) =>
    set((s) => ({
      railCollapsedByWorkspace: {
        ...s.railCollapsedByWorkspace,
        [workspaceId]: !s.railCollapsedByWorkspace[workspaceId],
      },
    })),

  setRailCollapsed: (workspaceId, collapsed) =>
    set((s) => ({
      railCollapsedByWorkspace: {
        ...s.railCollapsedByWorkspace,
        [workspaceId]: collapsed,
      },
    })),

  setFilters: (workspaceId, patch) =>
    set((s) => {
      const curr = s.filtersByWorkspace[workspaceId] ?? DEFAULT_FILTERS
      return {
        filtersByWorkspace: {
          ...s.filtersByWorkspace,
          [workspaceId]: { ...curr, ...patch },
        },
      }
    }),

  setStyle: (workspaceId, patch) =>
    set((s) => {
      const curr = s.styleByWorkspace[workspaceId] ?? DEFAULT_STYLE
      return {
        styleByWorkspace: {
          ...s.styleByWorkspace,
          [workspaceId]: { ...curr, ...patch },
        },
      }
    }),

  setGraphCamera: (workspaceId, camera) =>
    set((s) => ({
      graphCameraByWorkspace: {
        ...s.graphCameraByWorkspace,
        [workspaceId]: camera,
      },
    })),

  selectNode: (workspaceId, nodeId) =>
    set((s) => ({
      selectedNodeByWorkspace: {
        ...s.selectedNodeByWorkspace,
        [workspaceId]: nodeId,
      },
    })),

  clearWorkspace: (workspaceId) =>
    set((s) => {
      const strip = <T>(rec: Record<string, T>): Record<string, T> => {
        if (!(workspaceId in rec)) return rec
        const { [workspaceId]: _drop, ...rest } = rec
        return rest
      }
      return {
        modeByWorkspace: strip(s.modeByWorkspace),
        railCollapsedByWorkspace: strip(s.railCollapsedByWorkspace),
        filtersByWorkspace: strip(s.filtersByWorkspace),
        styleByWorkspace: strip(s.styleByWorkspace),
        graphCameraByWorkspace: strip(s.graphCameraByWorkspace),
        selectedNodeByWorkspace: strip(s.selectedNodeByWorkspace),
      }
    }),
}))

export function getFilters(s: BoardUiState, workspaceId: string): GraphFilters {
  return s.filtersByWorkspace[workspaceId] ?? DEFAULT_FILTERS
}

export function getStyle(s: BoardUiState, workspaceId: string): GraphStyle {
  return s.styleByWorkspace[workspaceId] ?? DEFAULT_STYLE
}
