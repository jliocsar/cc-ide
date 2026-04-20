import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  channels,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
  ipcContract,
} from '@shared/ipc'
import { slugifyFirstMessage, validateTmuxWindowName } from '@shared/tmux-name'
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { broadcast } from './event-bus'
import * as canvasStore from './modules/canvas-store'
import { generateClaudeWindowName } from './modules/cat-name-gen'
import * as depgraph from './modules/depgraph'
import * as diffProvider from './modules/diff-provider'
import * as dropsStore from './modules/drops-store'
import * as ephemeralWorktrees from './modules/ephemeral-worktrees'
import * as planFsTree from './modules/plan-fs-tree'
import * as promptsFsTree from './modules/prompts-fs-tree'
import * as promptsStore from './modules/prompts-store'
import * as ptyManager from './modules/pty-manager'
import * as sessionDiscovery from './modules/session-discovery'
import * as sessionWatcher from './modules/session-watcher'
import * as settingsStore from './modules/settings-store'
import * as tabsStore from './modules/tabs-store'
import * as tmux from './modules/tmux-adapter'
import {
  disposePlansAndPromptsWatchers,
  ensurePlansWatcher,
  ensurePromptsWatcher,
  ensureSessionWatcher,
  ensureWorktreeWatcher,
} from './modules/watchers'
import * as workspaceRegistry from './modules/workspace-registry'
import * as worktreeManager from './modules/worktree-manager'

async function getWorkspaceOrThrow(workspaceId: string) {
  const ws = await workspaceRegistry.getWorkspace(workspaceId)
  if (!ws) throw new Error(`workspace not found: ${workspaceId}`)
  return ws
}

async function attachViewerPty(opts: {
  primarySession: string
  windowTarget: string
  cwd: string
  cols: number
  rows: number
}): Promise<string> {
  const viewerName = `${opts.primarySession}-v-${randomUUID().slice(0, 8)}`
  await tmux.createViewerSession({
    primarySession: opts.primarySession,
    viewerName,
    windowTarget: opts.windowTarget,
  })
  await tmux.hardenViewerSession(viewerName)
  return ptyManager.openPty({
    command: 'tmux',
    args: ['attach-session', '-t', viewerName],
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    onExit: async () => {
      await tmux.killViewerSession(viewerName)
    },
  })
}

async function getDataRoot(): Promise<string> {
  const settings = await settingsStore.readSettings()
  return settings.workspace.dataRoot
}

function slugifyBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\//g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function computeResumeWindowName(
  workspacePath: string,
  primarySession: string,
  sessionId: string,
): Promise<string> {
  const sessions = await sessionDiscovery.listSessions(workspacePath)
  const summary = sessions.find((s) => s.id === sessionId)
  const slug = slugifyFirstMessage(summary?.firstUserMessage ?? null)
  const base = slug ? `claude-${slug}` : `claude-r-${sessionId.slice(0, 8)}`
  if (!(await tmux.hasWindow(`${primarySession}:${base}`))) return base
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`
    if (candidate.length > 64) break
    if (!(await tmux.hasWindow(`${primarySession}:${candidate}`))) return candidate
  }
  return `claude-r-${sessionId.slice(0, 8)}-${randomUUID().slice(0, 4)}`
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

type Handler<C extends IpcChannel> = (
  payload: IpcRequest<C>,
) => Promise<IpcResponse<C>> | IpcResponse<C>

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
    const ws = await getWorkspaceOrThrow(workspaceId)
    if (!(await tmux.tmuxAvailable())) throw new Error('tmux is not installed or not in PATH')
    const primarySession = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(primarySession, ws.path)
    const windowName = await computeResumeWindowName(ws.path, primarySession, sessionId)
    const tmuxWindow = await tmux.spawnWindow({
      sessionName: primarySession,
      windowName,
      cwd: ws.path,
      // Interactive zsh sources ~/.zshrc (PATH + aliases — `claude` may
      // be aliased to a user wrapper). After claude exits, `exit` tears
      // the shell down unconditionally so the pane can't drop to a
      // prompt, regardless of IGNOREEOF, plugin hooks, or similar.
      command: `zsh -ic 'claude --resume ${sessionId}; exit'`,
    })
    const ptyId = await attachViewerPty({
      primarySession,
      windowTarget: tmuxWindow,
      cwd: ws.path,
      cols,
      rows,
    })
    return { ptyId, tmuxWindow, worktreeBranch: null }
  },
  'session:spawnClaude': async ({ workspaceId, cols, rows, customName, worktree }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const hasTmux = await tmux.tmuxAvailable()
    if (!hasTmux) throw new Error('tmux is not installed or not in PATH')
    const primarySession = tmux.sessionNameForWorkspace(ws.id)
    await tmux.ensureSession(primarySession, ws.path)
    if (customName !== undefined) {
      const validation = validateTmuxWindowName(customName)
      if (!validation.ok) throw new Error(validation.reason)
      if (await tmux.hasWindow(`${primarySession}:${customName}`)) {
        throw new Error(`a window named "${customName}" already exists in this workspace`)
      }
    }

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

    const windowName = customName ?? (await generateClaudeWindowName(primarySession))
    const tmuxWindow = await tmux.spawnWindow({
      sessionName: primarySession,
      windowName,
      cwd,
      // see the resume flow above for why this is `zsh -ic 'claude; exit'`.
      command: `zsh -ic 'claude; exit'`,
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

    const ptyId = await attachViewerPty({
      primarySession,
      windowTarget: tmuxWindow,
      cwd,
      cols,
      rows,
    })

    let worktreeBranch: string | null = null
    if (worktree?.kind === 'new') {
      worktreeBranch = worktree.branch
    } else if (worktree?.kind === 'existing') {
      worktreeBranch = await worktreeManager.currentBranch(cwd)
    }
    return { ptyId, tmuxWindow, worktreeBranch }
  },

  'git:listBranches': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const [branches, current] = await Promise.all([
      worktreeManager.listLocalBranches(ws.path),
      worktreeManager.currentBranch(ws.path),
    ])
    return { branches, current }
  },

  'worktrees:listNonEphemeral': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
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
    const ws = await getWorkspaceOrThrow(workspaceId)
    const worktree = await worktreeManager.createWorktree({
      repoPath: ws.path,
      worktreePath,
      branch,
      baseBranch,
    })
    return { worktree }
  },
  'worktrees:delete': async ({ workspaceId, worktreePath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
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
  'globalPrompts:list': async ({ query, sort }) => {
    const prompts = await promptsStore.listPrompts({ query, sort })
    return { prompts }
  },
  'globalPrompts:create': async ({ title, body, favorite }) => {
    const prompt = await promptsStore.createPrompt({ title, body, favorite })
    return { prompt }
  },
  'globalPrompts:update': async ({ id, patch }) => {
    const prompt = await promptsStore.updatePrompt(id, patch)
    return { prompt }
  },
  'globalPrompts:delete': async ({ id }) => {
    await promptsStore.deletePrompt(id)
    return { ok: true }
  },
  'prompts:tree': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const dataRoot = await getDataRoot()
    void ensurePromptsWatcher(workspaceId, ws.path, dataRoot)
    const tree = await promptsFsTree.listTree(ws.path, dataRoot)
    return { tree }
  },
  'prompts:read': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const content = await promptsFsTree.readPrompt(ws.path, relPath, await getDataRoot())
    return { content }
  },
  'prompts:write': async ({ workspaceId, relPath, content }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await promptsFsTree.writePrompt(ws.path, relPath, content, await getDataRoot())
    return { ok: true }
  },
  'prompts:create': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await promptsFsTree.createPrompt(ws.path, relPath, await getDataRoot())
    return { ok: true }
  },
  'prompts:createFolder': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await promptsFsTree.createFolder(ws.path, relPath, await getDataRoot())
    return { ok: true }
  },
  'prompts:rename': async ({ workspaceId, fromRel, toRel, overwrite }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await promptsFsTree.rename(ws.path, fromRel, toRel, {
      overwrite,
      dataRoot: await getDataRoot(),
    })
    return { ok: true }
  },
  'prompts:delete': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await promptsFsTree.deletePath(ws.path, relPath, await getDataRoot())
    return { ok: true }
  },
  'plans:tree': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const dataRoot = await getDataRoot()
    const migration = await planFsTree.migrateLegacyIfNeeded(workspaceId, ws.path, dataRoot)
    if (migration === 'migrated') {
      console.log(
        `[plans] migrated legacy plans for workspace ${workspaceId} → ${ws.path}/${dataRoot}/plans`,
      )
    } else if (migration === 'skipped-dest-populated') {
      console.warn(
        `[plans] legacy plans at ~/.cc-ide/plans/${workspaceId} left in place: destination ${ws.path}/${dataRoot}/plans already has content`,
      )
    }
    void ensurePlansWatcher(workspaceId, ws.path, dataRoot)
    const tree = await planFsTree.listTree(ws.path, dataRoot)
    return { tree }
  },
  'plans:read': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    const content = await planFsTree.readPlan(ws.path, relPath, await getDataRoot())
    return { content }
  },
  'plans:write': async ({ workspaceId, relPath, content }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await planFsTree.writePlan(ws.path, relPath, content, await getDataRoot())
    return { ok: true }
  },
  'plans:create': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await planFsTree.createPlan(ws.path, relPath, await getDataRoot())
    return { ok: true }
  },
  'plans:createFolder': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await planFsTree.createFolder(ws.path, relPath, await getDataRoot())
    return { ok: true }
  },
  'plans:rename': async ({ workspaceId, fromRel, toRel, overwrite }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await planFsTree.rename(ws.path, fromRel, toRel, { overwrite, dataRoot: await getDataRoot() })
    return { ok: true }
  },
  'plans:delete': async ({ workspaceId, relPath }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await planFsTree.deletePath(ws.path, relPath, await getDataRoot())
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
  'settings:get': async () => {
    const settings = await settingsStore.readSettings()
    return { settings }
  },
  'settings:set': async ({ patch }) => {
    const prev = await settingsStore.readSettings()
    const settings = await settingsStore.updateSettings(patch)
    if (prev.workspace.dataRoot !== settings.workspace.dataRoot) {
      disposePlansAndPromptsWatchers()
    }
    broadcast('settings:changed', { settings })
    return { settings }
  },
  'clipboard:write': async ({ text }) => {
    clipboard.writeText(text)
    return { ok: true }
  },
  'shell:openPath': async ({ absolutePath }) => {
    const err = await shell.openPath(absolutePath)
    if (err) throw new Error(err)
    return { ok: true }
  },
  'graph:subscribe': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await depgraph.subscribe(workspaceId, ws.path)
    return { ok: true }
  },
  'graph:unsubscribe': async ({ workspaceId }) => {
    await depgraph.unsubscribe(workspaceId)
    return { ok: true }
  },
  'graph:refresh': async ({ workspaceId }) => {
    const ws = await getWorkspaceOrThrow(workspaceId)
    await depgraph.refresh(workspaceId, ws.path)
    return { ok: true }
  },
  'drops:list': async ({ workspaceId }) => {
    const entries = await dropsStore.listDrops(workspaceId)
    return { entries }
  },
  'drops:write': async ({ workspaceId, entries }) => {
    await dropsStore.writeDrops(workspaceId, entries)
    return { ok: true }
  },
  'window:minimize': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.minimize()
    return { ok: true }
  },
  'window:maximize': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
    return { ok: true }
  },
  'window:close': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.close()
    return { ok: true }
  },
  'window:isMaximized': async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    return { maximized: win?.isMaximized() ?? false }
  },
  'session:attachExisting': async ({ workspaceId, tmuxWindow, cols, rows }) => {
    const ws = await workspaceRegistry.getWorkspace(workspaceId)
    if (!ws) return { ptyId: null, exists: false }
    if (!(await tmux.tmuxAvailable())) return { ptyId: null, exists: false }
    const exists = await tmux.hasWindow(tmuxWindow)
    if (!exists) return { ptyId: null, exists: false }
    const [primarySession] = tmuxWindow.split(':')
    if (!primarySession) return { ptyId: null, exists: false }
    const ptyId = await attachViewerPty({
      primarySession,
      windowTarget: tmuxWindow,
      cwd: ws.path,
      cols,
      rows,
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
        throw new Error(
          `[ipc:${channel}] handler returned invalid response: ${response.error.message}`,
        )
      }
      return response.data
    })
  }
}
