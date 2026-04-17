import type { GraphDelta, GraphEdgeWire, GraphNode, NodeId } from './types'

/**
 * Frame-based coalescer: accumulates deltas from multiple sources over a short
 * window, flushes a single merged delta on demand. The caller decides the
 * window (setTimeout vs setImmediate) to fit its event loop.
 */
export class DeltaCoalescer {
  private addNodes = new Map<NodeId, GraphNode>()
  private removeNodes = new Set<NodeId>()
  private addEdges = new Map<string, GraphEdgeWire>()
  private removeEdges = new Map<string, { from: NodeId; to: NodeId }>()
  private updateEdgeKinds = new Map<string, GraphEdgeWire>()

  add(delta: GraphDelta): void {
    if (delta.addNodes) {
      for (const n of delta.addNodes) {
        this.removeNodes.delete(n.id)
        this.addNodes.set(n.id, n)
      }
    }
    if (delta.removeNodes) {
      for (const id of delta.removeNodes) {
        this.addNodes.delete(id)
        this.removeNodes.add(id)
      }
    }
    if (delta.addEdges) {
      for (const e of delta.addEdges) {
        const k = key(e.from, e.to)
        this.removeEdges.delete(k)
        this.addEdges.set(k, e)
        this.updateEdgeKinds.delete(k)
      }
    }
    if (delta.removeEdges) {
      for (const e of delta.removeEdges) {
        const k = key(e.from, e.to)
        this.addEdges.delete(k)
        this.updateEdgeKinds.delete(k)
        this.removeEdges.set(k, e)
      }
    }
    if (delta.updateEdgeKinds) {
      for (const e of delta.updateEdgeKinds) {
        const k = key(e.from, e.to)
        // if the edge is being newly added in the same frame, fold kinds into addEdges
        const pending = this.addEdges.get(k)
        if (pending) {
          this.addEdges.set(k, { ...pending, kinds: e.kinds })
        } else {
          this.updateEdgeKinds.set(k, e)
        }
      }
    }
  }

  isEmpty(): boolean {
    return (
      this.addNodes.size === 0 &&
      this.removeNodes.size === 0 &&
      this.addEdges.size === 0 &&
      this.removeEdges.size === 0 &&
      this.updateEdgeKinds.size === 0
    )
  }

  flush(): GraphDelta | null {
    if (this.isEmpty()) return null
    const delta: GraphDelta = {}
    if (this.addNodes.size) delta.addNodes = [...this.addNodes.values()]
    if (this.removeNodes.size) delta.removeNodes = [...this.removeNodes]
    if (this.addEdges.size) delta.addEdges = [...this.addEdges.values()]
    if (this.removeEdges.size) delta.removeEdges = [...this.removeEdges.values()]
    if (this.updateEdgeKinds.size) delta.updateEdgeKinds = [...this.updateEdgeKinds.values()]
    this.addNodes.clear()
    this.removeNodes.clear()
    this.addEdges.clear()
    this.removeEdges.clear()
    this.updateEdgeKinds.clear()
    return delta
  }
}

function key(from: NodeId, to: NodeId): string {
  return `${from}>>${to}`
}
