import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import * as depgraph from './modules/depgraph'
import { disposeAll as disposeSessionWatcher } from './modules/session-watcher'
import { disposeAllWatchers } from './modules/watchers'

if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const broadcastMaximized = (): void => {
    mainWindow.webContents.send('window:maximized-change', {
      maximized: mainWindow.isMaximized(),
    })
  }
  mainWindow.on('maximize', broadcastMaximized)
  mainWindow.on('unmaximize', broadcastMaximized)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (is.dev && process.env['CC_IDE_DEVTOOLS'] === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.cc-ide')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  disposeAllWatchers()
  disposeSessionWatcher()
  void depgraph.disposeAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
