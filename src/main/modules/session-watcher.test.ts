import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __getTrackedForTests,
  __tickNowForTests,
  disposeAll,
  rename,
  setExitHandler,
  type Tracked,
  track,
  untrack,
} from './session-watcher'
import * as tmux from './tmux-adapter'

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

  it('swallows listWindows errors in tick', async () => {
    track(entry())
    vi.spyOn(tmux, 'listWindows').mockRejectedValue(new Error('tmux down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await __tickNowForTests('ccide-deadbeef')
    expect(errSpy).toHaveBeenCalled()
    expect(__getTrackedForTests()).toHaveLength(1)
  })

  it('swallows errors thrown by the exit handler', async () => {
    setExitHandler(() => {
      throw new Error('handler boom')
    })
    track(entry())
    vi.spyOn(tmux, 'listWindows').mockResolvedValue([])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await __tickNowForTests('ccide-deadbeef')
    expect(errSpy).toHaveBeenCalled()
    expect(__getTrackedForTests()).toEqual([])
  })

  it('ensurePoll sets an interval that is cleared on untrack', async () => {
    vi.useFakeTimers()
    vi.spyOn(tmux, 'listWindows').mockResolvedValue([])
    track(entry())
    vi.advanceTimersByTime(3000)
    untrack('ccide-deadbeef', 'claude-oreo')
    vi.useRealTimers()
  })

  it('skips tracked entries that belong to a different primary session', async () => {
    const calls: Tracked[] = []
    setExitHandler((t) => {
      calls.push(t)
    })
    track(entry({ primarySession: 'ccide-other', windowName: 'claude-other' }))
    track(entry({ primarySession: 'ccide-deadbeef', windowName: 'claude-mine' }))
    vi.spyOn(tmux, 'listWindows').mockResolvedValue([])
    await __tickNowForTests('ccide-deadbeef')
    expect(calls.map((c) => c.windowName)).toEqual(['claude-mine'])
    expect(__getTrackedForTests().some((t) => t.windowName === 'claude-other')).toBe(true)
  })

  it('rename re-keys the tracked entry so a renamed window is not seen as exited', async () => {
    const calls: Tracked[] = []
    setExitHandler((t) => {
      calls.push(t)
    })
    track(entry())
    const renamed = rename('ccide-deadbeef', 'claude-oreo', 'claude-cookie')
    expect(renamed?.windowName).toBe('claude-cookie')
    vi.spyOn(tmux, 'listWindows').mockResolvedValue(['claude-cookie'])
    await __tickNowForTests('ccide-deadbeef')
    expect(calls).toEqual([])
    expect(__getTrackedForTests().map((t) => t.windowName)).toEqual(['claude-cookie'])
  })

  it('rename returns null when the entry is not tracked', () => {
    expect(rename('ccide-deadbeef', 'nope', 'newer')).toBeNull()
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
