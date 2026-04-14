import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { channels, ipcContract, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'
import * as workspaceRegistry from './modules/workspace-registry'
import * as tmux from './modules/tmux-adapter'
import * as ptyManager from './modules/pty-manager'
import * as canvasStore from './modules/canvas-store'
import * as sessionDiscovery from './modules/session-discovery'
import * as worktreeManager from './modules/worktree-manager'
import * as diffProvider from './modules/diff-provider'
import * as promptsStore from './modules/prompts-store'
import * as planFsTree from './modules/plan-fs-tree'

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

  'workspace:remove': async ({ id }) => {
    await workspaceRegistry.removeWorkspace(id)
    return { ok: true }
  },
  'session:resumeClaude': async ({ workspaceId, sessionId, cols, rows }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    if (!(await tmux.tmuxAvailable())) throw new Error('tmux is not installed or not in PATH')
    const primarySession = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(primarySession, ws.path)
    const windowName = `claude-r-${sessionId.slice(0, 8)}`
    const tmuxWindow = await tmux.spawnWindow({
      sessionName: primarySession,
      windowName,
      cwd: ws.path,
      command: `claude --resume ${sessionId}`,
    })
    const viewerName = `${primarySession}-v-${randomUUID().slice(0, 8)}`
    await tmux.createViewerSession({ primarySession, viewerName, windowTarget: tmuxWindow })
    const ptyId = ptyManager.openPty({
      command: 'tmux',
      args: ['attach-session', '-t', viewerName],
      cwd: ws.path,
      cols,
      rows,
      onExit: async () => {
        await tmux.killViewerSession(viewerName)
      },
    })
    return { ptyId, tmuxWindow }
  },
  'session:spawnClaude': async ({ workspaceId, cols, rows }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const hasTmux = await tmux.tmuxAvailable()
    if (!hasTmux) throw new Error('tmux is not installed or not in PATH')
    const primarySession = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(primarySession, ws.path)
    const windowName = `claude-${Date.now().toString(36)}`
    const tmuxWindow = await tmux.spawnWindow({
      sessionName: primarySession,
      windowName,
      cwd: ws.path,
      command: 'claude',
    })
    const viewerName = `${primarySession}-v-${randomUUID().slice(0, 8)}`
    await tmux.createViewerSession({
      primarySession,
      viewerName,
      windowTarget: tmuxWindow,
    })
    const ptyId = ptyManager.openPty({
      command: 'tmux',
      args: ['attach-session', '-t', viewerName],
      cwd: ws.path,
      cols,
      rows,
      onExit: async () => {
        await tmux.killViewerSession(viewerName)
      },
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
  'canvas:load': async ({ workspaceId }) => {
    const state = await canvasStore.loadCanvas(workspaceId)
    return { state }
  },
  'canvas:save': async ({ workspaceId, state }) => {
    await canvasStore.saveCanvas(workspaceId, state)
    return { ok: true }
  },
  'session:killTmuxWindow': async ({ tmuxWindow }) => {
    await tmux.killWindow(tmuxWindow)
    return { ok: true }
  },
  'sessions:list': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { sessions: [] }
    const sessions = await sessionDiscovery.listSessions(ws.path)
    return { sessions }
  },
  'worktrees:list': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { worktrees: [] }
    const worktrees = await worktreeManager.listWorktrees(ws.path)
    return { worktrees }
  },
  'worktrees:create': async ({ workspaceId, worktreePath, branch, baseBranch }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const worktree = await worktreeManager.createWorktree({
      repoPath: ws.path,
      worktreePath,
      branch,
      baseBranch,
    })
    return { worktree }
  },
  'worktrees:delete': async ({ workspaceId, worktreePath }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    await worktreeManager.deleteWorktree(ws.path, worktreePath)
    return { ok: true }
  },
  'worktrees:canDelete': async ({ worktree }) => {
    const guard = await worktreeManager.canDeleteWorktree(worktree)
    return { guard }
  },
  'diffs:list': async ({ worktreePath }) => {
    const files = await diffProvider.listChangedFiles(worktreePath)
    return { files }
  },
  'diffs:get': async ({ worktreePath, path, stage }) => {
    const diff = await diffProvider.getFileDiff(worktreePath, path, stage)
    return { diff }
  },
  'prompts:list': async ({ query, sort }) => {
    const prompts = await promptsStore.listPrompts({ query, sort })
    return { prompts }
  },
  'prompts:create': async ({ title, body, favorite }) => {
    const prompt = await promptsStore.createPrompt({ title, body, favorite })
    return { prompt }
  },
  'prompts:update': async ({ id, patch }) => {
    const prompt = await promptsStore.updatePrompt(id, patch)
    return { prompt }
  },
  'prompts:delete': async ({ id }) => {
    await promptsStore.deletePrompt(id)
    return { ok: true }
  },
  'plans:tree': async ({ workspaceId }) => {
    const tree = await planFsTree.listTree(workspaceId)
    return { tree }
  },
  'plans:read': async ({ workspaceId, relPath }) => {
    const content = await planFsTree.readPlan(workspaceId, relPath)
    return { content }
  },
  'plans:write': async ({ workspaceId, relPath, content }) => {
    await planFsTree.writePlan(workspaceId, relPath, content)
    return { ok: true }
  },
  'plans:create': async ({ workspaceId, relPath }) => {
    await planFsTree.createPlan(workspaceId, relPath)
    return { ok: true }
  },
  'plans:createFolder': async ({ workspaceId, relPath }) => {
    await planFsTree.createFolder(workspaceId, relPath)
    return { ok: true }
  },
  'plans:rename': async ({ workspaceId, fromRel, toRel }) => {
    await planFsTree.rename(workspaceId, fromRel, toRel)
    return { ok: true }
  },
  'plans:delete': async ({ workspaceId, relPath }) => {
    await planFsTree.deletePath(workspaceId, relPath)
    return { ok: true }
  },
  'session:attachExisting': async ({ workspaceId, tmuxWindow, cols, rows }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { ptyId: null, exists: false }
    if (!(await tmux.tmuxAvailable())) return { ptyId: null, exists: false }
    const exists = await tmux.hasWindow(tmuxWindow)
    if (!exists) return { ptyId: null, exists: false }
    const [primarySession] = tmuxWindow.split(':')
    if (!primarySession) return { ptyId: null, exists: false }
    const viewerName = `${primarySession}-v-${randomUUID().slice(0, 8)}`
    await tmux.createViewerSession({ primarySession, viewerName, windowTarget: tmuxWindow })
    const ptyId = ptyManager.openPty({
      command: 'tmux',
      args: ['attach-session', '-t', viewerName],
      cwd: ws.path,
      cols,
      rows,
      onExit: async () => {
        await tmux.killViewerSession(viewerName)
      },
    })
    return { ptyId, exists: true }
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
