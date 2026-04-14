import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'

export function invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
  return window.ccIde.invoke(channel, payload)
}
