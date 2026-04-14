import { z } from 'zod'

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  addedAt: z.number(),
})
export type Workspace = z.infer<typeof workspaceSchema>

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
