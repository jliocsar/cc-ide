import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
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
import * as tabsStore from './modules/tabs-store'
import * as ephemeralWorktrees from './modules/ephemeral-worktrees'
import * as sessionWatcher from './modules/session-watcher'
import { generateClaudeWindowName } from './modules/cat-name-gen'
import { validateTmuxWindowName } from '@shared/tmux-name'
import { broadcast } from './modules/event-bus'
import {
  ensurePlansWatcher,
  ensureSessionWatcher,
  ensureWorktreeWatcher,
} from './modules/watchers'

function slugifyBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\//g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function uniqueWorktreePath(repoPath: string, slug: string): Promise<string> {
  const base = join(repoPath, '.claude', 'worktrees')
  let candidate = join(base, slug)
  let n = 2
  while (true) {
    const exists = await fs.stat(candidate).catch(() => null)
    if (!exists) return candidate
    candidate = join(base, `${slug}-${n}`)
    n++
  }
}

sessionWatcher.setExitHandler(async (t) => {
  const entry = await ephemeralWorktrees.findByPath(t.workspaceId, t.worktreePath)
  if (!entry) return
  let action: 'deleted' | 'promoted' = 'promoted'
  try {
    const untouched = await worktreeManager.isWorktreeUntouched(t.worktreePath, t.base)
    if (untouched) {
      await worktreeManager.deleteWorktree(t.repoPath, t.worktreePath)
      await worktreeManager.deleteBranchIfMerged(t.repoPath, t.branch)
      action = 'deleted'
    }
  } catch (err) {
    console.error('ephemeral cleanup failed', err)
  }
  await ephemeralWorktrees.remove(t.workspaceId, t.worktreePath)
  broadcast('worktree:cleaned', {
    workspaceId: t.workspaceId,
    worktreePath: t.worktreePath,
    branch: t.branch,
    action,
  })
})

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
  'session:spawnClaude': async ({ workspaceId, cols, rows, worktree }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const hasTmux = await tmux.tmuxAvailable()
    if (!hasTmux) throw new Error('tmux is not installed or not in PATH')
    const primarySession = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(primarySession, ws.path)

    let cwd = ws.path
    let ephemeral: {
      worktreePath: string
      branch: string
      base: string
    } | null = null

    if (worktree?.kind === 'existing') {
      cwd = resolve(worktree.path)
    } else if (worktree?.kind === 'new') {
      const slug = slugifyBranch(worktree.branch) || 'wt'
      const worktreePath = await uniqueWorktreePath(ws.path, slug)
      await worktreeManager.createWorktree({
        repoPath: ws.path,
        worktreePath,
        branch: worktree.branch,
        baseBranch: worktree.base,
      })
      cwd = worktreePath
      ephemeral = { worktreePath, branch: worktree.branch, base: worktree.base }
    }

    const windowName = await generateClaudeWindowName(primarySession)
    const tmuxWindow = await tmux.spawnWindow({
      sessionName: primarySession,
      windowName,
      cwd,
      command: 'claude',
    })
    const viewerName = `${primarySession}-v-${randomUUID().slice(0, 8)}`
    await tmux.createViewerSession({
      primarySession,
      viewerName,
      windowTarget: tmuxWindow,
    })

    if (ephemeral) {
      await ephemeralWorktrees.add({
        workspaceId,
        worktreePath: ephemeral.worktreePath,
        branch: ephemeral.branch,
        base: ephemeral.base,
        windowName,
        createdAt: Date.now(),
      })
      sessionWatcher.track({
        workspaceId,
        primarySession,
        windowName,
        worktreePath: ephemeral.worktreePath,
        branch: ephemeral.branch,
        base: ephemeral.base,
        repoPath: ws.path,
      })
    }

    const ptyId = ptyManager.openPty({
      command: 'tmux',
      args: ['attach-session', '-t', viewerName],
      cwd,
      cols,
      rows,
      onExit: async () => {
        await tmux.killViewerSession(viewerName)
      },
    })
    return { ptyId, tmuxWindow }
  },

  'git:listBranches': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const [branches, current] = await Promise.all([
      worktreeManager.listLocalBranches(ws.path),
      worktreeManager.currentBranch(ws.path),
    ])
    return { branches, current }
  },

  'worktrees:listNonEphemeral': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
    const [all, ephemerals] = await Promise.all([
      worktreeManager.listWorktrees(ws.path),
      ephemeralWorktrees.list(workspaceId),
    ])
    const ephemeralPaths = new Set(ephemerals.map((e) => e.worktreePath))
    const filtered = all
      .filter((w) => !w.isBare && !w.isLocked)
      .filter((w) => !ephemeralPaths.has(w.path))
      .map((w) => ({ path: w.path, branch: w.branch, isPrimary: w.isPrimary }))
    return { worktrees: filtered }
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
  'session:renameTmuxWindow': async ({ tmuxWindow, newName }) => {
    const validation = validateTmuxWindowName(newName)
    if (!validation.ok) throw new Error(validation.reason)
    const [sessionName, oldName] = tmuxWindow.split(':')
    if (!sessionName || !oldName) throw new Error('invalid tmux window target')
    const newTarget = `${sessionName}:${newName}`
    if (newTarget === tmuxWindow) return { tmuxWindow }
    const exists = await tmux.hasWindow(newTarget)
    if (exists) throw new Error(`a window named "${newName}" already exists in this session`)
    const hadOld = await tmux.hasWindow(tmuxWindow)
    if (!hadOld) throw new Error('window no longer exists')
    await tmux.renameWindow(sessionName, oldName, newName)
    return { tmuxWindow: newTarget }
  },
  'conversations:list': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { conversations: [] }
    void ensureSessionWatcher(ws.id, ws.path)
    const conversations = await sessionDiscovery.listSessions(ws.path)
    return { conversations }
  },
  'worktrees:list': async ({ workspaceId }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { worktrees: [] }
    void ensureWorktreeWatcher(ws.id, ws.path)
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
    void ensurePlansWatcher(workspaceId)
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
  'plans:rename': async ({ workspaceId, fromRel, toRel, overwrite }) => {
    await planFsTree.rename(workspaceId, fromRel, toRel, { overwrite })
    return { ok: true }
  },
  'plans:delete': async ({ workspaceId, relPath }) => {
    await planFsTree.deletePath(workspaceId, relPath)
    return { ok: true }
  },
  'tabs:load': async ({ workspaceId }) => {
    const state = await tabsStore.loadTabs(workspaceId)
    return { state }
  },
  'tabs:save': async ({ workspaceId, state }) => {
    await tabsStore.saveTabs(workspaceId, state)
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
