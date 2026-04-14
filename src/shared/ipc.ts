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
    response: z.object({ workspace: workspaceSchema.nullable(), error: z.string().nullable() }),
  },
  'session:spawnClaude': {
    request: z.object({ workspaceId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
    response: z.object({ ptyId: z.string(), tmuxWindow: z.string() }),
  },
  'pty:write': {
    request: z.object({ ptyId: z.string(), data: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'pty:resize': {
    request: z.object({ ptyId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
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
  'sessions:list': {
    request: z.object({ workspaceId: z.string() }),
    response: z.object({ sessions: z.array(sessionSummarySchema) }),
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
    request: z.object({ worktreePath: z.string(), path: z.string(), stage: diffStageSchema }),
    response: z.object({ diff: fileDiffSchema }),
  },
  'prompts:list': {
    request: z.object({ query: z.string().optional(), sort: sortModeSchema.optional() }),
    response: z.object({ prompts: z.array(promptSchema) }),
  },
  'prompts:create': {
    request: z.object({ title: z.string(), body: z.string(), favorite: z.boolean().optional() }),
    response: z.object({ prompt: promptSchema }),
  },
  'prompts:update': {
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
  'prompts:delete': {
    request: z.object({ id: z.string() }),
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
    request: z.object({ workspaceId: z.string(), relPath: z.string(), content: z.string() }),
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
    request: z.object({ workspaceId: z.string(), fromRel: z.string(), toRel: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  'plans:delete': {
    request: z.object({ workspaceId: z.string(), relPath: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
} as const

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>
export const channels = Object.keys(ipcContract) as IpcChannel[]

export const ptyDataEventSchema = z.object({ ptyId: z.string(), data: z.string() })
export const ptyExitEventSchema = z.object({ ptyId: z.string(), exitCode: z.number().nullable() })

export const eventChannels = {
  'pty:data': ptyDataEventSchema,
  'pty:exit': ptyExitEventSchema,
} as const

export type IpcEventChannel = keyof typeof eventChannels
export type IpcEvent<C extends IpcEventChannel> = z.infer<(typeof eventChannels)[C]>
