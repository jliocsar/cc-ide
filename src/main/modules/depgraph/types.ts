import type {
  GraphDeltaDTO,
  GraphEdgeKindDTO,
  GraphEdgeWireDTO,
  GraphNodeDTO,
  GraphNodeLangDTO,
} from '@shared/ipc'

export type NodeId = string
export type EdgeKind = GraphEdgeKindDTO
export type Lang = GraphNodeLangDTO
export type GraphNode = GraphNodeDTO
export type GraphEdgeWire = GraphEdgeWireDTO
export type GraphDelta = GraphDeltaDTO

export interface ResolvedModule {
  /** Absolute path on disk. Null means the import is external (node_modules). */
  resolvedPath: string | null
  /** Present when the module is external (node_modules / package import). */
  packageName?: string
  /** Present when we could determine language from the resolved extension. */
  lang?: Lang
}

export interface ResolverArgs {
  specifier: string
  containingFile: string
}

export interface ModuleResolver {
  resolve(args: ResolverArgs): Promise<ResolvedModule | null>
}

export interface LanguageParser {
  id: string
  matches(path: string): boolean
  scan(workspacePath: string): AsyncIterable<GraphDelta>
  onFileChange?(path: string, workspacePath: string): Promise<GraphDelta | null>
  stop(): void
}

/** In-memory main-side graph state for a single workspace. */
export interface WorkspaceGraphState {
  nodes: Map<NodeId, GraphNode>
  edges: Map<string, { from: NodeId; to: NodeId; kinds: Set<EdgeKind> }>
  /** `to` → set of edge ids (`from>>to`) pointing at it. */
  incoming: Map<NodeId, Set<string>>
  /** `from` → set of edge ids (`from>>to`) originating here. */
  outgoing: Map<NodeId, Set<string>>
  /** Last-known resolved import set per file, for no-op delta detection. */
  fileImports: Map<NodeId, Map<NodeId, Set<EdgeKind>>>
}

export function canonicalEdgeId(from: NodeId, to: NodeId): string {
  return `${from}>>${to}`
}

export function emptyWorkspaceGraphState(): WorkspaceGraphState {
  return {
    nodes: new Map(),
    edges: new Map(),
    incoming: new Map(),
    outgoing: new Map(),
    fileImports: new Map(),
  }
}
