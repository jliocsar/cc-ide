import * as tmux from './tmux-adapter'

const POLL_MS = 3000

export type Tracked = {
  workspaceId: string
  primarySession: string
  windowName: string
  worktreePath: string
  branch: string
  base: string
  repoPath: string
}

type ExitHandler = (t: Tracked) => void | Promise<void>

// Keyed by primarySession + ':' + windowName — unique.
const tracked = new Map<string, Tracked>()
const pollingFor = new Map<string, ReturnType<typeof setInterval>>()
let exitHandler: ExitHandler | null = null

export function setExitHandler(h: ExitHandler): void {
  exitHandler = h
}

function key(primarySession: string, windowName: string): string {
  return `${primarySession}:${windowName}`
}

export function track(t: Tracked): void {
  tracked.set(key(t.primarySession, t.windowName), t)
  ensurePoll(t.primarySession)
}

export function untrack(primarySession: string, windowName: string): void {
  tracked.delete(key(primarySession, windowName))
  if (![...tracked.keys()].some((k) => k.startsWith(primarySession + ':'))) {
    stopPoll(primarySession)
  }
}

function ensurePoll(primarySession: string): void {
  if (pollingFor.has(primarySession)) return
  const timer = setInterval(() => {
    void tick(primarySession)
  }, POLL_MS)
  pollingFor.set(primarySession, timer)
}

function stopPoll(primarySession: string): void {
  const t = pollingFor.get(primarySession)
  if (t) clearInterval(t)
  pollingFor.delete(primarySession)
}

async function tick(primarySession: string): Promise<void> {
  let live: string[]
  try {
    live = await tmux.listWindows(primarySession)
  } catch (err) {
    console.error(`[session-watcher] listWindows(${primarySession}) failed:`, err)
    return
  }
  const liveSet = new Set(live)
  const exited: Tracked[] = []
  for (const [k, t] of tracked) {
    if (!k.startsWith(primarySession + ':')) continue
    if (!liveSet.has(t.windowName)) exited.push(t)
  }
  for (const t of exited) {
    tracked.delete(key(t.primarySession, t.windowName))
    try {
      await exitHandler?.(t)
    } catch (err) {
      console.error('session-watcher exit handler failed', err)
    }
  }
  if (![...tracked.keys()].some((k) => k.startsWith(primarySession + ':'))) {
    stopPoll(primarySession)
  }
}

export function disposeAll(): void {
  for (const t of pollingFor.values()) clearInterval(t)
  pollingFor.clear()
  tracked.clear()
  exitHandler = null
}

// Test hooks.
export function __getTrackedForTests(): Tracked[] {
  return [...tracked.values()]
}
export function __tickNowForTests(primarySession: string): Promise<void> {
  return tick(primarySession)
}
