import type { GraphEdgeKindDTO, GraphNodeDTO } from '@shared/ipc'

export interface WorkerEdge {
  from: string
  to: string
  kinds: GraphEdgeKindDTO[]
}

export interface WorkerSeedPosition {
  id: string
  x: number
  y: number
}

export type WorkerIn =
  | {
      type: 'init'
      nodes: GraphNodeDTO[]
      edges: WorkerEdge[]
      seedPositions?: WorkerSeedPosition[]
    }
  | {
      type: 'delta'
      addNodes?: GraphNodeDTO[]
      removeNodes?: string[]
      addEdges?: WorkerEdge[]
      removeEdges?: { from: string; to: string }[]
      updateEdgeKinds?: WorkerEdge[]
    }
  | { type: 'reheat'; alpha: number }
  | { type: 'stop' }

export type WorkerOut =
  | {
      type: 'tick'
      /** [idIndex0, x0, y0, idIndex1, x1, y1, ...]. Numeric indices map through the latest idMap. */
      positions: Float32Array
    }
  | { type: 'idMap'; mapping: { id: string; index: number }[] }
  | { type: 'stats'; tickMs: number; fps: number }
