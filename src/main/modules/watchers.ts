import { type FSWatcher, promises as fsp, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { broadcast } from '../event-bus'
import { DEFAULT_DATA_ROOT } from './plan-fs-tree'
import { pathToSlug } from './session-discovery'

const DEBOUNCE_MS = 300

type WorkspaceWatchers = {
  sessions?: FSWatcher
  worktrees?: FSWatcher
  plans?: FSWatcher
  prompts?: FSWatcher
  sessionsTimer?: ReturnType<typeof setTimeout>
  worktreesTimer?: ReturnType<typeof setTimeout>
  plansTimer?: ReturnType<typeof setTimeout>
  promptsTimer?: ReturnType<typeof setTimeout>
}

const registry = new Map<string, WorkspaceWatchers>()

function getOrCreate(workspaceId: string): WorkspaceWatchers {
  let w = registry.get(workspaceId)
  if (!w) {
    w = {}
    registry.set(workspaceId, w)
  }
  return w
}

async function ensureDir(path: string): Promise<boolean> {
  try {
    await fsp.mkdir(path, { recursive: true })
    return true
  } catch {
    try {
      await fsp.stat(path)
      return true
    } catch {
      return false
    }
  }
}

async function tryWatch(
  path: string,
  opts: { recursive?: boolean },
  onEvent: () => void,
): Promise<FSWatcher | undefined> {
  try {
    const exists = await ensureDir(path)
    if (!exists) return undefined
    const w = watch(path, { recursive: opts.recursive ?? false, persistent: false }, () =>
      onEvent(),
    )
    w.on('error', () => {})
    return w
  } catch {
    return undefined
  }
}

export async function ensureSessionWatcher(
  workspaceId: string,
  workspacePath: string,
): Promise<void> {
  const entry = getOrCreate(workspaceId)
  if (entry.sessions) return
  const dir = join(homedir(), '.claude', 'projects', pathToSlug(workspacePath))
  const w = await tryWatch(dir, { recursive: false }, () => {
    if (entry.sessionsTimer) clearTimeout(entry.sessionsTimer)
    entry.sessionsTimer = setTimeout(() => {
      broadcast('conversations:changed', { workspaceId })
    }, DEBOUNCE_MS)
  })
  entry.sessions = w
}

export async function ensureWorktreeWatcher(
  workspaceId: string,
  workspacePath: string,
): Promise<void> {
  const entry = getOrCreate(workspaceId)
  if (entry.worktrees) return
  const dir = join(workspacePath, '.git', 'worktrees')
  const w = await tryWatch(dir, { recursive: false }, () => {
    if (entry.worktreesTimer) clearTimeout(entry.worktreesTimer)
    entry.worktreesTimer = setTimeout(() => {
      broadcast('worktrees:changed', { workspaceId })
    }, DEBOUNCE_MS)
  })
  entry.worktrees = w
}

export async function ensurePlansWatcher(
  workspaceId: string,
  workspacePath: string,
  dataRoot: string = DEFAULT_DATA_ROOT,
): Promise<void> {
  const entry = getOrCreate(workspaceId)
  if (entry.plans) return
  const dir = join(workspacePath, dataRoot, 'plans')
  const w = await tryWatch(dir, { recursive: true }, () => {
    if (entry.plansTimer) clearTimeout(entry.plansTimer)
    entry.plansTimer = setTimeout(() => {
      broadcast('plans:changed', { workspaceId })
    }, DEBOUNCE_MS)
  })
  entry.plans = w
}

export async function ensurePromptsWatcher(
  workspaceId: string,
  workspacePath: string,
  dataRoot: string = DEFAULT_DATA_ROOT,
): Promise<void> {
  const entry = getOrCreate(workspaceId)
  if (entry.prompts) return
  const dir = join(workspacePath, dataRoot, 'prompts')
  const w = await tryWatch(dir, { recursive: true }, () => {
    if (entry.promptsTimer) clearTimeout(entry.promptsTimer)
    entry.promptsTimer = setTimeout(() => {
      broadcast('prompts:changed', { workspaceId })
    }, DEBOUNCE_MS)
  })
  entry.prompts = w
}

// Invalidate plans+prompts watchers across all workspaces. Called after
// `settings.workspace.dataRoot` changes so the next ensure*Watcher picks
// up the new location.
export function disposePlansAndPromptsWatchers(): void {
  for (const entry of registry.values()) {
    entry.plans?.close()
    entry.plans = undefined
    entry.prompts?.close()
    entry.prompts = undefined
    if (entry.plansTimer) clearTimeout(entry.plansTimer)
    entry.plansTimer = undefined
    if (entry.promptsTimer) clearTimeout(entry.promptsTimer)
    entry.promptsTimer = undefined
  }
}

export function disposeAllWatchers(): void {
  for (const entry of registry.values()) {
    entry.sessions?.close()
    entry.worktrees?.close()
    entry.plans?.close()
    entry.prompts?.close()
    if (entry.sessionsTimer) clearTimeout(entry.sessionsTimer)
    if (entry.worktreesTimer) clearTimeout(entry.worktreesTimer)
    if (entry.plansTimer) clearTimeout(entry.plansTimer)
    if (entry.promptsTimer) clearTimeout(entry.promptsTimer)
  }
  registry.clear()
}
