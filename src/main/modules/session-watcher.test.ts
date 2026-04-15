import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tmux from './tmux-adapter'
import {
  __getTrackedForTests,
  __tickNowForTests,
  disposeAll,
  setExitHandler,
  track,
  untrack,
  type Tracked,
} from './session-watcher'

const entry = (overrides: Partial<Tracked> = {}): Tracked => ({
  workspaceId: 'ws-1',
  primarySession: 'ccide-deadbeef',
  windowName: 'claude-oreo',
  worktreePath: '/tmp/wt/oreo',
  branch: 'feat/oreo',
  base: 'main',
  repoPath: '/tmp/repo',
  ...overrides,
})

beforeEach(() => {
  disposeAll()
})

afterEach(() => {
  disposeAll()
  vi.restoreAllMocks()
})

describe('session-watcher', () => {
  it('track / untrack bookkeeping', () => {
    track(entry())
    expect(__getTrackedForTests()).toHaveLength(1)
    untrack('ccide-deadbeef', 'claude-oreo')
    expect(__getTrackedForTests()).toEqual([])
  })

  it('fires exit handler when window disappears', async () => {
    const calls: Tracked[] = []
    setExitHandler((t) => {
      calls.push(t)
    })
    track(entry())
    vi.spyOn(tmux, 'listWindows').mockResolvedValue([]) // nothing alive
    await __tickNowForTests('ccide-deadbeef')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.windowName).toBe('claude-oreo')
    // tracked cleared after exit
    expect(__getTrackedForTests()).toEqual([])
  })

  it('does not fire when window is still alive', async () => {
    const calls: Tracked[] = []
    setExitHandler((t) => {
      calls.push(t)
    })
    track(entry())
    vi.spyOn(tmux, 'listWindows').mockResolvedValue(['claude-oreo'])
    await __tickNowForTests('ccide-deadbeef')
    expect(calls).toEqual([])
    expect(__getTrackedForTests()).toHaveLength(1)
  })

  it('only fires for windows that disappeared; keeps others', async () => {
    const calls: Tracked[] = []
    setExitHandler((t) => {
      calls.push(t)
    })
    track(entry({ windowName: 'claude-a' }))
    track(entry({ windowName: 'claude-b' }))
    vi.spyOn(tmux, 'listWindows').mockResolvedValue(['claude-b'])
    await __tickNowForTests('ccide-deadbeef')
    expect(calls.map((c) => c.windowName)).toEqual(['claude-a'])
    expect(__getTrackedForTests().map((t) => t.windowName)).toEqual(['claude-b'])
  })
})
