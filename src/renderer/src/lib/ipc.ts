import type { IpcChannel, IpcEvent, IpcEventChannel, IpcRequest, IpcResponse } from '@shared/ipc'

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
