import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'

const api = {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
    return ipcRenderer.invoke(channel, payload)
  },
}

contextBridge.exposeInMainWorld('ccIde', api)

export type CcIdeApi = typeof api
