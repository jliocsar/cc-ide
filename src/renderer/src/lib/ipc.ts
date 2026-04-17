import type { IpcChannel, IpcRequest, IpcResponse, IpcEventChannel, IpcEvent } from '@shared/ipc'

export function invoke<C extends IpcChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return window.ccIde.invoke(channel, payload)
}

export function onEvent<C extends IpcEventChannel>(
  channel: C,
  listener: (payload: IpcEvent<C>) => void,
): () => void {
  return window.ccIde.on(channel, listener)
}
