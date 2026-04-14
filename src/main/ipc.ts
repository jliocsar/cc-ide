import { BrowserWindow, dialog, ipcMain } from 'electron'
import { channels, ipcContract, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'
import * as workspaceRegistry from './modules/workspace-registry'
import * as tmux from './modules/tmux-adapter'
import * as ptyManager from './modules/pty-manager'

type Handler<C extends IpcChannel> = (payload: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>

const handlers: { [C in IpcChannel]: Handler<C> } = {
  'app:ping': async ({ at }) => ({
    pong: true,
    receivedAt: Date.now(),
    roundTripFromClient: Date.now() - at,
  }),

  'workspace:list': async () => ({
    workspaces: await workspaceRegistry.listWorkspaces(),
  }),

  'workspace:pickAndAdd': async () => {
    const focused = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = focused
      ? await dialog.showOpenDialog(focused, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Select a git repository',
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return { workspace: null, error: null }
    }
    const chosen = result.filePaths[0]!
    try {
      const ws = await workspaceRegistry.addWorkspace(chosen)
      return { workspace: ws, error: null }
    } catch (err) {
      return { workspace: null, error: err instanceof Error ? err.message : String(err) }
    }
  },

  'session:spawnClaude': async ({ workspaceId, cols, rows }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const hasTmux = await tmux.tmuxAvailable()
    if (!hasTmux) throw new Error('tmux is not installed or not in PATH')
    const sessionName = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(sessionName, ws.path)
    const windowName = `claude-${Date.now().toString(36)}`
    const tmuxWindow = await tmux.spawnWindow({
      sessionName,
      windowName,
      cwd: ws.path,
      command: 'claude',
    })
    const ptyId = ptyManager.openPty({
      command: 'tmux',
      args: ['attach-session', '-t', tmuxWindow],
      cwd: ws.path,
      cols,
      rows,
    })
    return { ptyId, tmuxWindow }
  },

  'pty:write': async ({ ptyId, data }) => {
    ptyManager.writePty(ptyId, data)
    return { ok: true }
  },
  'pty:resize': async ({ ptyId, cols, rows }) => {
    ptyManager.resizePty(ptyId, cols, rows)
    return { ok: true }
  },
  'pty:close': async ({ ptyId }) => {
    ptyManager.closePty(ptyId)
    return { ok: true }
  },
}

export function registerIpcHandlers(): void {
  for (const channel of channels) {
    const schema = ipcContract[channel]
    ipcMain.handle(channel, async (_event, rawPayload) => {
      const parsed = schema.request.safeParse(rawPayload)
      if (!parsed.success) {
        throw new Error(`[ipc:${channel}] invalid request: ${parsed.error.message}`)
      }
      const result = await (handlers[channel] as Handler<typeof channel>)(parsed.data)
      const response = schema.response.safeParse(result)
      if (!response.success) {
        throw new Error(`[ipc:${channel}] handler returned invalid response: ${response.error.message}`)
      }
      return response.data
    })
  }
}
