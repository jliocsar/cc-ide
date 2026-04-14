import { ipcMain } from 'electron'
import { channels, ipcContract, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'

type Handler<C extends IpcChannel> = (payload: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>

const handlers: { [C in IpcChannel]: Handler<C> } = {
  'app:ping': async ({ at }) => ({
    pong: true,
    receivedAt: Date.now(),
    roundTripFromClient: Date.now() - at,
  }),
}

export function registerIpcHandlers(): void {
  for (const channel of channels) {
    const schema = ipcContract[channel]
    ipcMain.handle(channel, async (_event, rawPayload) => {
      const parsed = schema.request.safeParse(rawPayload)
      if (!parsed.success) {
        throw new Error(`[ipc:${channel}] invalid request: ${parsed.error.message}`)
      }
      const result = await (handlers[channel] as Handler<typeof channel>)(parsed.data)
      const response = schema.response.safeParse(result)
      if (!response.success) {
        throw new Error(`[ipc:${channel}] handler returned invalid response: ${response.error.message}`)
      }
      return response.data
    })
  }
}
