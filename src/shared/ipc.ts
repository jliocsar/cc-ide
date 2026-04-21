import { z } from 'zod'

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  addedAt: z.number(),
})
export type Workspace = z.infer<typeof workspaceSchema>

export const sessionSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  path: z.string(),
  updatedAt: z.number(),
  createdAt: z.number().nullable(),
  firstUserMessage: z.string().nullable(),
  messageCount: z.number(),
})
export type SessionSummaryDTO = z.infer<typeof sessionSummarySchema>

export const worktreeSchema = z.object({
  path: z.string(),
  branch: z.string().nullable(),
  head: z.string(),
  isPrimary: z.boolean(),
  isBare: z.boolean(),
  isDetached: z.boolean(),
  isLocked: z.boolean(),
})
export type WorktreeDTO = z.infer<typeof worktreeSchema>

export const deleteGuardReasonSchema = z.enum([
  'dirty-working-tree',
  'unpushed-commits',
  'no-remote-tracking',
  'primary-worktree',
])
export const deleteGuardSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reasons: z.array(deleteGuardReasonSchema) }),
])
export type DeleteGuardDTO = z.infer<typeof deleteGuardSchema>

export const fileStatusSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'untracked',
])
export const diffStageSchema = z.enum(['staged', 'unstaged'])
export const changedFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  status: fileStatusSchema,
  stage: diffStageSchema,
  additions: z.number(),
  deletions: z.number(),
  binary: z.boolean(),
})
export type ChangedFileDTO = z.infer<typeof changedFileSchema>

export const diffHunkLineSchema = z.object({
  kind: z.enum(['context', 'add', 'remove']),
  oldLineNo: z.number().nullable(),
  newLineNo: z.number().nullable(),
  content: z.string(),
})
export const diffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  header: z.string(),
  lines: z.array(diffHunkLineSchema),
})
export const fileDiffSchema = z.object({
  file: changedFileSchema,
  hunks: z.array(diffHunkSchema),
  binary: z.boolean(),
  tooLarge: z.boolean(),
})
export type FileDiffDTO = z.infer<typeof fileDiffSchema>
export type DiffHunkDTO = z.infer<typeof diffHunkSchema>
export type DiffHunkLineDTO = z.infer<typeof diffHunkLineSchema>

export const promptSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  favorite: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type PromptDTO = z.infer<typeof promptSchema>
export const sortModeSchema = z.enum(['favorites-first', 'title'])

export const editorKeybindsSchema = z.enum(['vscode', 'vim'])
export type EditorKeybindsDTO = z.infer<typeof editorKeybindsSchema>
export const terminalFontSchema = z.enum(['geist-mono', 'system'])
export type TerminalFontDTO = z.infer<typeof terminalFontSchema>
export const editorFontSchema = z.enum(['geist', 'geist-mono', 'space-grotesk', 'system'])
export type EditorFontDTO = z.infer<typeof editorFontSchema>
export const diffFontSchema = z.enum(['geist-mono', 'system'])
export type DiffFontDTO = z.infer<typeof diffFontSchema>
export const settingsSchema = z.object({
  editor: z.object({
    keybinds: editorKeybindsSchema,
    font: editorFontSchema,
    fontSize: z.number(),
  }),
  terminal: z.object({
    font: terminalFontSchema,
    fontSize: z.number(),
  }),
  diff: z.object({
    font: diffFontSchema,
    fontSize: z.number(),
    wrap: z.boolean(),
    stickyGutter: z.boolean(),
  }),
  workspace: z.object({
    dataRoot: z.string(),
  }),
})
export type SettingsDTO = z.infer<typeof settingsSchema>
export const settingsPatchSchema = z.object({
  editor: z
    .object({
      keybinds: editorKeybindsSchema.optional(),
      font: editorFontSchema.optional(),
      fontSize: z.number().optional(),
    })
    .optional(),
  terminal: z
    .object({
      font: terminalFontSchema.optional(),
      fontSize: z.number().optional(),
    })
    .optional(),
  diff: z
    .object({
      font: diffFontSchema.optional(),
      fontSize: z.number().optional(),
      wrap: z.boolean().optional(),
      stickyGutter: z.boolean().optional(),
    })
    .optional(),
  workspace: z
    .object({
      dataRoot: z.string().optional(),
    })
    .optional(),
})

// ──────────────────── Dependency graph ────────────────────

export const graphEdgeKindSchema = z.enum(['static', 'type', 'dynamic', 'reexport', 'asset'])
export type GraphEdgeKindDTO = z.infer<typeof graphEdgeKindSchema>

export const graphNodeLangSchema = z.enum([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'css',
  'dts',
  'external',
])
export type GraphNodeLangDTO = z.infer<typeof graphNodeLangSchema>

export const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['file', 'external']),
  lang: graphNodeLangSchema,
  loc: z.number().optional(),
  external: z.object({ packageName: z.string() }).optional(),
})
export type GraphNodeDTO = z.infer<typeof graphNodeSchema>

// Kinds serialize as sorted array on the wire; reconstructed as Set in-memory
// where needed. Keep the wire form flat/serializable.
export const graphEdgeWireSchema = z.object({
  from: z.string(),
  to: z.string(),
  kinds: z.array(graphEdgeKindSchema),
})
export type GraphEdgeWireDTO = z.infer<typeof graphEdgeWireSchema>

export const graphDeltaSchema = z.object({
  addNodes: z.array(graphNodeSchema).optional(),
  removeNodes: z.array(z.string()).optional(),
  addEdges: z.array(graphEdgeWireSchema).optional(),
  removeEdges: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  updateEdgeKinds: z.array(graphEdgeWireSchema).optional(),
})
export type GraphDeltaDTO = z.infer<typeof graphDeltaSchema>

export const graphSnapshotSchema = z.object({
  workspaceId: z.string(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeWireSchema),
  scanDone: z.boolean(),
})
export type GraphSnapshotDTO = z.infer<typeof graphSnapshotSchema>

export const graphDeltaEventSchema = z.object({
  workspaceId: z.string(),
  delta: graphDeltaSchema,
})
export const graphScanProgressEventSchema = z.object({
  workspaceId: z.string(),
  filesScanned: z.number(),
  filesTotal: z.number().nullable(),
})
export const graphScanEndEventSchema = z.object({
  workspaceId: z.string(),
  finalNodeCount: z.number(),
  finalEdgeCount: z.number(),
})
export const graphErrorEventSchema = z.object({
  workspaceId: z.string(),
  message: z.string(),
})

// ──────────────────── Drops ────────────────────

export const dropEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  relPath: z.string(),
  addedAt: z.number(),
})
export type DropEntryDTO = z.infer<typeof dropEntrySchema>

export const ipcContract = {
  'app:ping': {
    request: z.object({ at: z.number() }),
    response: z.object({
      pong: z.literal(true),
      receivedAt: z.number(),
      roundTripFromClient: z.number(),
    }),
  },
  'workspace:list': {
    request: z.object({}),
    response: z.object({ workspaces: z.array(workspaceSchema) }),
  },
  'workspace:pickAndAdd': {
    request: z.object({}),
    response: z.object({
      workspace: workspaceSchema.nullable(),
      error: z.string().nullable(),
    }),
  },
  'workspace:remove': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'session:resumeClaude': {
    request: z.object({
      workspaceId: z.string(),
      sessionId: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    }),
    response: z.object({
      ptyId: z.string(),
      tmuxWindow: z.string(),
      worktreeBranch: z.string().nullable(),
    }),
  },
  'session:spawnClaude': {
    request: z.object({
      workspaceId: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
      customName: z.string().optional(),
      worktree: z
        .union([
          z.object({ kind: z.literal('primary') }),
          z.object({ kind: z.literal('existing'), path: z.string() }),
          z.object({
            kind: z.literal('new'),
            branch: z.string(),
            base: z.string(),
          }),
        ])
        .optional(),
    }),
    response: z.object({
      ptyId: z.string(),
      tmuxWindow: z.string(),
      worktreeBranch: z.string().nullable(),
    }),
  },
  'git:listBranches': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({
      branches: z.array(z.string()),
      current: z.string().nullable(),
    }),
  },
  'worktrees:listNonEphemeral': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({
      worktrees: z.array(
        z.object({
          path: z.string(),
          branch: z.string().nullable(),
          isPrimary: z.boolean(),
        }),
      ),
    }),
  },
  'pty:write': {
    request: z.object({ ptyId: z.string(), data: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'pty:resize': {
    request: z.object({
      ptyId: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'pty:close': {
    request: z.object({ ptyId: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'canvas:load': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ state: z.unknown().nullable() }),
  },
  'canvas:save': {
    request: z.object({ workspaceId: z.string(), state: z.unknown() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'session:killTmuxWindow': {
    request: z.object({ tmuxWindow: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'session:renameTmuxWindow': {
    request: z.object({ tmuxWindow: z.string(), newName: z.string() }),
    response: z.object({ tmuxWindow: z.string() }),
  },
  'session:attachExisting': {
    request: z.object({
      workspaceId: z.string(),
      tmuxWindow: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    }),
    response: z.object({
      ptyId: z.string().nullable(),
      exists: z.boolean(),
    }),
  },
  'conversations:list': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ conversations: z.array(sessionSummarySchema) }),
  },
  'worktrees:list': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ worktrees: z.array(worktreeSchema) }),
  },
  'worktrees:create': {
    request: z.object({
      workspaceId: z.string(),
      worktreePath: z.string(),
      branch: z.string(),
      baseBranch: z.string().optional(),
    }),
    response: z.object({ worktree: worktreeSchema }),
  },
  'worktrees:delete': {
    request: z.object({ workspaceId: z.string(), worktreePath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'worktrees:canDelete': {
    request: z.object({ worktree: worktreeSchema }),
    response: z.object({ guard: deleteGuardSchema }),
  },
  'diffs:list': {
    request: z.object({ worktreePath: z.string() }),
    response: z.object({ files: z.array(changedFileSchema) }),
  },
  'diffs:get': {
    request: z.object({
      worktreePath: z.string(),
      path: z.string(),
      stage: diffStageSchema,
    }),
    response: z.object({ diff: fileDiffSchema }),
  },
  'globalPrompts:list': {
    request: z.object({
      query: z.string().optional(),
      sort: sortModeSchema.optional(),
    }),
    response: z.object({ prompts: z.array(promptSchema) }),
  },
  'globalPrompts:create': {
    request: z.object({
      title: z.string(),
      body: z.string(),
      favorite: z.boolean().optional(),
    }),
    response: z.object({ prompt: promptSchema }),
  },
  'globalPrompts:update': {
    request: z.object({
      id: z.string(),
      patch: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        favorite: z.boolean().optional(),
      }),
    }),
    response: z.object({ prompt: promptSchema }),
  },
  'globalPrompts:delete': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'prompts:tree': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ tree: z.unknown() }),
  },
  'prompts:read': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ content: z.string() }),
  },
  'prompts:write': {
    request: z.object({
      workspaceId: z.string(),
      relPath: z.string(),
      content: z.string(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'prompts:create': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'prompts:createFolder': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'prompts:rename': {
    request: z.object({
      workspaceId: z.string(),
      fromRel: z.string(),
      toRel: z.string(),
      overwrite: z.boolean().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'prompts:delete': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:tree': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ tree: z.unknown() }),
  },
  'plans:read': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ content: z.string() }),
  },
  'plans:write': {
    request: z.object({
      workspaceId: z.string(),
      relPath: z.string(),
      content: z.string(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:create': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:createFolder': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:rename': {
    request: z.object({
      workspaceId: z.string(),
      fromRel: z.string(),
      toRel: z.string(),
      overwrite: z.boolean().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:delete': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'tabs:load': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ state: z.unknown().nullable() }),
  },
  'tabs:save': {
    request: z.object({ workspaceId: z.string(), state: z.unknown() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'settings:get': {
    request: z.object({}),
    response: z.object({ settings: settingsSchema }),
  },
  'settings:set': {
    request: z.object({ patch: settingsPatchSchema }),
    response: z.object({ settings: settingsSchema }),
  },
  'clipboard:write': {
    request: z.object({ text: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'shell:openPath': {
    request: z.object({ absolutePath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'graph:subscribe': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'graph:unsubscribe': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'graph:refresh': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'drops:list': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ entries: z.array(dropEntrySchema) }),
  },
  'drops:write': {
    request: z.object({
      workspaceId: z.string(),
      entries: z.array(dropEntrySchema),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  'window:minimize': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  'window:maximize': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  'window:close': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  'window:isMaximized': {
    request: z.object({}),
    response: z.object({ maximized: z.boolean() }),
  },
  'teammate:attach': {
    request: z.object({ socket: z.string(), pane: z.string() }),
    response: z.object({ snapshot: z.string() }),
  },
  'teammate:detach': {
    request: z.object({ socket: z.string(), pane: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'teammate:sendKeys': {
    request: z.object({ socket: z.string(), pane: z.string(), data: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'teammate:sendSpecialKey': {
    request: z.object({ socket: z.string(), pane: z.string(), key: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'teammate:paste': {
    request: z.object({ socket: z.string(), pane: z.string(), data: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
} as const

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>
export const channels = Object.keys(ipcContract) as IpcChannel[]

export const ptyDataEventSchema = z.object({
  ptyId: z.string(),
  data: z.string(),
})
export const ptyExitEventSchema = z.object({
  ptyId: z.string(),
  exitCode: z.number().nullable(),
})
export const workspaceScopedEventSchema = z.object({ workspaceId: z.string() })

export const worktreeCleanedEventSchema = z.object({
  workspaceId: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
  action: z.enum(['deleted', 'promoted']),
})

export const settingsChangedEventSchema = z.object({
  settings: settingsSchema,
})

export const windowMaximizedEventSchema = z.object({
  maximized: z.boolean(),
})

// ──────────────────── Agent events (teammates + subagents) ────────────────────
//
// Fired by the HTTP hook-server (main) when Claude's hooks POST resolved
// spawn/stop events. See references/agent-teams.md for the on-disk model and
// rules/hooks-integration.md for the install contract.

export const agentTeammateStartEventSchema = z.object({
  sessionId: z.string(),
  parentSessionId: z.string(),
  parentCcIdeWindow: z.string(),
  teamName: z.string().nullable(),
  agentName: z.string().nullable(),
  agentColor: z.string().nullable(),
  agentType: z.string().nullable(),
  tmuxSocket: z.string().nullable(),
  tmuxPane: z.string().nullable(),
  cwd: z.string().nullable(),
  transcriptPath: z.string().nullable(),
})
export type AgentTeammateStartEvent = z.infer<typeof agentTeammateStartEventSchema>

export const agentSubagentStartEventSchema = z.object({
  parentSessionId: z.string(),
  parentCcIdeWindow: z.string().nullable(),
  agentId: z.string(),
  agentType: z.string().nullable(),
  teammateName: z.string().nullable(),
  cwd: z.string().nullable(),
})
export type AgentSubagentStartEvent = z.infer<typeof agentSubagentStartEventSchema>

export const agentSubagentStopEventSchema = z.object({
  parentSessionId: z.string(),
  agentId: z.string(),
  agentTranscriptPath: z.string().nullable(),
  lastAssistantMessage: z.string().nullable(),
})
export type AgentSubagentStopEvent = z.infer<typeof agentSubagentStopEventSchema>

// Parsed subagent transcript line. `tool-use` pairs with a later `tool-result`
// via toolUseId (the renderer collapses the pair into a single rendered unit).
export const transcriptEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    uuid: z.string(),
    ts: z.number(),
    kind: z.literal('assistant-text'),
    text: z.string(),
  }),
  z.object({
    uuid: z.string(),
    ts: z.number(),
    kind: z.literal('tool-use'),
    toolName: z.string(),
    toolInput: z.unknown(),
    toolUseId: z.string(),
  }),
  z.object({
    uuid: z.string(),
    ts: z.number(),
    kind: z.literal('tool-result'),
    toolUseId: z.string(),
    text: z.string(),
    isError: z.boolean(),
  }),
  z.object({
    uuid: z.string(),
    ts: z.number(),
    kind: z.literal('user-text'),
    text: z.string(),
  }),
])
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>

export const agentSubagentTranscriptLineEventSchema = z.object({
  parentSessionId: z.string(),
  agentId: z.string(),
  entries: z.array(transcriptEntrySchema),
})
export type AgentSubagentTranscriptLineEvent = z.infer<
  typeof agentSubagentTranscriptLineEventSchema
>

// Bytes streamed from a mirrored tmux pane (teammate window). The renderer
// feeds these into xterm as they arrive.
export const teammateDataEventSchema = z.object({
  socket: z.string(),
  pane: z.string(),
  data: z.string(),
})
export type TeammateDataEvent = z.infer<typeof teammateDataEventSchema>

export const teammateMirrorExitEventSchema = z.object({
  socket: z.string(),
  pane: z.string(),
})
export type TeammateMirrorExitEvent = z.infer<typeof teammateMirrorExitEventSchema>

export const eventChannels = {
  'pty:data': ptyDataEventSchema,
  'pty:exit': ptyExitEventSchema,
  'window:maximized-change': windowMaximizedEventSchema,
  'conversations:changed': workspaceScopedEventSchema,
  'worktrees:changed': workspaceScopedEventSchema,
  'plans:changed': workspaceScopedEventSchema,
  'prompts:changed': workspaceScopedEventSchema,
  'worktree:cleaned': worktreeCleanedEventSchema,
  'settings:changed': settingsChangedEventSchema,
  'graph:snapshot': graphSnapshotSchema,
  'graph:delta': graphDeltaEventSchema,
  'graph:scanProgress': graphScanProgressEventSchema,
  'graph:scanEnd': graphScanEndEventSchema,
  'graph:error': graphErrorEventSchema,
  'agent:teammateStart': agentTeammateStartEventSchema,
  'agent:subagentStart': agentSubagentStartEventSchema,
  'agent:subagentStop': agentSubagentStopEventSchema,
  'agent:subagentTranscriptLine': agentSubagentTranscriptLineEventSchema,
  'teammate:data': teammateDataEventSchema,
  'teammate:mirrorExit': teammateMirrorExitEventSchema,
} as const

export type IpcEventChannel = keyof typeof eventChannels
export type IpcEvent<C extends IpcEventChannel> = z.infer<(typeof eventChannels)[C]>
