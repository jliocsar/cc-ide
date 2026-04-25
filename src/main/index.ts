import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { ensureClaudeHooksInstalled } from './modules/claude-hooks-installer'
import * as depgraph from './modules/depgraph'
import { HOOK_PORT, startHookServer, stopHookServer } from './modules/hook-server'
import { disposeAll as disposeSessionWatcher } from './modules/session-watcher'
import {
  bindAgentEvents as bindSubagentTail,
  disposeAll as disposeSubagentTail,
} from './modules/subagent-tail'
import { disposeAll as disposeTeammateMirror } from './modules/teammate-mirror'
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('dev.cc-ide')

  // Auto-grant `local-fonts` so the renderer's queryLocalFonts() resolves
  // without a permission prompt. The Settings font picker depends on it.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'local-fonts') return callback(true)
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'local-fonts'
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  // Hook server + installer are best-effort. A failure here (port in use, fs
  // error) must not block the app launch — users without the hook plumbing
  // still get a working IDE, just without teammate/subagent auto-spawn.
  try {
    const port = await startHookServer({ port: HOOK_PORT })
    await ensureClaudeHooksInstalled({ port })
    bindSubagentTail()
  } catch (err) {
    console.error('[main] claude hook server/install failed — continuing without:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  disposeAllWatchers()
  disposeSessionWatcher()
  void depgraph.disposeAll()
  disposeSubagentTail()
  disposeTeammateMirror()
  void stopHookServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
