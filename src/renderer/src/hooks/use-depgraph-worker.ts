import { useEffect, useRef } from 'react'
import { invoke, onEvent } from '@/lib/ipc'
import { useDepGraph } from '@/state/depgraph'
import { useGraphPositions } from '@/state/graph-positions'
import type { WorkerIn, WorkerOut } from '@/workers/depgraph-layout.types'
import DepgraphWorker from '@/workers/depgraph-layout.worker?worker'

export interface LivePositions {
  byIndex: Float32Array | null
  idMap: Map<string, number>
  indexToId: Map<number, string>
}

export type NodeAnim = { appearAt: number; disappearAt: number | null }

interface Args {
  workspaceId: string | null | undefined
  active: boolean
}

interface Handle {
  positionsRef: React.MutableRefObject<LivePositions>
  nodeAnimRef: React.MutableRefObject<Map<string, NodeAnim>>
}

export function useDepgraphWorker({ workspaceId, active }: Args): Handle {
  const positionsRef = useRef<LivePositions>({
    byIndex: null,
    idMap: new Map(),
    indexToId: new Map(),
  })
  const nodeAnimRef = useRef<Map<string, NodeAnim>>(new Map())

  useEffect(() => {
    if (!workspaceId || !active) return

    let cancelled = false
    const worker = new DepgraphWorker()
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data
      if (msg.type === 'idMap') {
        const nextIdMap = new Map<string, number>()
        const nextReverse = new Map<number, string>()
        for (const m of msg.mapping) {
          nextIdMap.set(m.id, m.index)
          nextReverse.set(m.index, m.id)
        }
        positionsRef.current = {
          byIndex: positionsRef.current.byIndex,
          idMap: nextIdMap,
          indexToId: nextReverse,
        }
      } else if (msg.type === 'tick') {
        positionsRef.current = {
          ...positionsRef.current,
          byIndex: msg.positions,
        }
      }
    }

    const { ingestSnapshot, ingestDelta, setScanProgress, setScanEnd } = useDepGraph.getState()

    const offSnap = onEvent('graph:snapshot', (snap) => {
      if (cancelled || snap.workspaceId !== workspaceId) return
      ingestSnapshot(snap)
      const seedMap = useGraphPositions.getState().get(workspaceId)
      const seeds = seedMap
        ? [...seedMap.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }))
        : undefined
      worker.postMessage({
        type: 'init',
        nodes: snap.nodes,
        edges: snap.edges.map((e) => ({ from: e.from, to: e.to, kinds: e.kinds })),
        seedPositions: seeds,
      } satisfies WorkerIn)
    })
    const offDelta = onEvent('graph:delta', ({ workspaceId: wsId, delta }) => {
      if (cancelled || wsId !== workspaceId) return
      const now = performance.now()
      if (delta.addNodes) {
        for (const n of delta.addNodes) {
          nodeAnimRef.current.set(n.id, { appearAt: now, disappearAt: null })
        }
      }
      if (delta.removeNodes) {
        for (const id of delta.removeNodes) {
          const anim = nodeAnimRef.current.get(id)
          if (anim) anim.disappearAt = now
          else nodeAnimRef.current.set(id, { appearAt: now - 9999, disappearAt: now })
        }
      }
      ingestDelta(wsId, delta)
      worker.postMessage({
        type: 'delta',
        addNodes: delta.addNodes,
        removeNodes: delta.removeNodes,
        addEdges: delta.addEdges?.map((e) => ({ from: e.from, to: e.to, kinds: e.kinds })),
        removeEdges: delta.removeEdges,
        updateEdgeKinds: delta.updateEdgeKinds?.map((e) => ({
          from: e.from,
          to: e.to,
          kinds: e.kinds,
        })),
      } satisfies WorkerIn)
    })
    const offProgress = onEvent('graph:scanProgress', ({ workspaceId: w, filesScanned }) => {
      if (w !== workspaceId) return
      setScanProgress(w, filesScanned)
    })
    const offEnd = onEvent('graph:scanEnd', ({ workspaceId: w, finalNodeCount, finalEdgeCount }) => {
      if (w !== workspaceId) return
      setScanEnd(w, finalNodeCount, finalEdgeCount)
    })

    void invoke('graph:subscribe', { workspaceId })

    return () => {
      cancelled = true
      offSnap()
      offDelta()
      offProgress()
      offEnd()
      void invoke('graph:unsubscribe', { workspaceId }).catch(() => {})
      useDepGraph.getState().clearWorkspace(workspaceId)
      worker.postMessage({ type: 'stop' } satisfies WorkerIn)
      worker.terminate()
    }
  }, [workspaceId, active])

  return { positionsRef, nodeAnimRef }
}
