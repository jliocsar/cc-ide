import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse, IpcEventChannel, IpcEvent } from '@shared/ipc'

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
