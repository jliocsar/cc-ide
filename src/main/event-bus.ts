import type { IpcEvent, IpcEventChannel } from '@shared/ipc'
import { BrowserWindow } from 'electron'

export function broadcast<C extends IpcEventChannel>(channel: C, payload: IpcEvent<C>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
