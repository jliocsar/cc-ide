import { BrowserWindow } from 'electron'
import type { IpcEventChannel, IpcEvent } from '@shared/ipc'

export function broadcast<C extends IpcEventChannel>(channel: C, payload: IpcEvent<C>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
