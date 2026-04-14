import { z } from 'zod'

export const ipcContract = {
  'app:ping': {
    request: z.object({ at: z.number() }),
    response: z.object({ pong: z.literal(true), receivedAt: z.number(), roundTripFromClient: z.number() }),
  },
} as const

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>

export const channels = Object.keys(ipcContract) as IpcChannel[]
