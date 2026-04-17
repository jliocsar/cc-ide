import type { IpcChannel, IpcEvent, IpcEventChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

const api = {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
    return ipcRenderer.invoke(channel, payload)
  },
  on<C extends IpcEventChannel>(channel: C, listener: (event: IpcEvent<C>) => void): () => void {
    const wrapped = (_event: IpcRendererEvent, payload: IpcEvent<C>) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('ccIde', api)

export type CcIdeApi = typeof api
