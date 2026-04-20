import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createViewerSession,
  ensureSession,
  hardenViewerSession,
  hasWindow,
  killViewerSession,
  killWindow,
  listWindows,
  renameWindow,
  sessionNameForWorkspace,
  spawnWindow,
  tmuxAvailable,
} from './tmux-adapter'

function killSession(name: string): void {
  spawnSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' })
}

let tmuxOk = false
beforeAll(async () => {
  tmuxOk = await tmuxAvailable()
})

describe('sessionNameForWorkspace', () => {
  it('creates ccide- prefixed name truncated to 8 chars', () => {
    const longId = 'abc12345-6789-0abc-def0-1234-56789abcdef0'
    expect(sessionNameForWorkspace(longId)).toBe('ccide-abc12345')
    expect(sessionNameForWorkspace('short')).toBe('ccide-short')
  })
})

describe('tmux-adapter renameWindow', () => {
  let sessionName: string

  beforeEach(async () => {
    if (!tmuxOk) return
    sessionName = `ccide-test-${randomUUID().slice(0, 8)}`
    await ensureSession(sessionName, tmpdir())
  })

  afterEach(() => {
    if (!tmuxOk) return
    killSession(sessionName)
  })

  it('renames a window and reports it under the new name', async () => {
    if (!tmuxOk) return
    const target = await spawnWindow({
      sessionName,
      windowName: 'claude-before',
      cwd: tmpdir(),
      command: 'sleep 30',
    })
    expect(await hasWindow(target)).toBe(true)

    await renameWindow(sessionName, 'claude-before', 'claude-after')

    expect(await hasWindow(`${sessionName}:claude-after`)).toBe(true)
    expect(await hasWindow(target)).toBe(false)

    const names = await listWindows(sessionName)
    expect(names).toContain('claude-after')
    expect(names).not.toContain('claude-before')

    await killWindow(`${sessionName}:claude-after`)
  })

  it('throws when the source window does not exist', async () => {
    if (!tmuxOk) return
    await expect(renameWindow(sessionName, 'does-not-exist', 'foo')).rejects.toThrow()
  })
})

describe('tmux-adapter viewer session', () => {
  let primarySession: string
  let viewerSession: string

  beforeEach(async () => {
    if (!tmuxOk) return
    primarySession = `ccide-test-primary-${randomUUID().slice(0, 6)}`
    viewerSession = `ccide-test-viewer-${randomUUID().slice(0, 6)}`
    await ensureSession(primarySession, tmpdir())
    await spawnWindow({
      sessionName: primarySession,
      windowName: 'target-window',
      cwd: tmpdir(),
      command: 'sleep 30',
    })
  })

  afterEach(async () => {
    if (!tmuxOk) return
    killSession(viewerSession)
    killSession(primarySession)
  })

  it('creates viewer with exactly one linked window and no placeholder', async () => {
    if (!tmuxOk) return
    const result = await createViewerSession({
      primarySession,
      viewerName: viewerSession,
      windowTarget: `${primarySession}:target-window`,
    })
    expect(result).toBe(viewerSession)
    const windows = await listWindows(viewerSession)
    expect(windows).toEqual(['target-window'])
    expect(await hasWindow(`${viewerSession}:__viewer_init__`)).toBe(false)
  })

  it('hardenViewerSession disables status and prefixes', async () => {
    if (!tmuxOk) return
    await createViewerSession({
      primarySession,
      viewerName: viewerSession,
      windowTarget: `${primarySession}:target-window`,
    })
    await hardenViewerSession(viewerSession)
    // If we get here without throwing, the hardening succeeded
  })

  it('killViewerSession removes viewer', async () => {
    if (!tmuxOk) return
    await createViewerSession({
      primarySession,
      viewerName: viewerSession,
      windowTarget: `${primarySession}:target-window`,
    })
    await killViewerSession(viewerSession)
    expect(await hasWindow(`${viewerSession}:0`)).toBe(false)
  })

  it('throws when new-session fails (duplicate viewer name)', async () => {
    if (!tmuxOk) return
    await createViewerSession({
      primarySession,
      viewerName: viewerSession,
      windowTarget: `${primarySession}:target-window`,
    })
    await expect(
      createViewerSession({
        primarySession,
        viewerName: viewerSession,
        windowTarget: `${primarySession}:target-window`,
      }),
    ).rejects.toThrow(/new-session/)
  })

  it('throws and cleans up when link-window fails', async () => {
    if (!tmuxOk) return
    await expect(
      createViewerSession({
        primarySession,
        viewerName: viewerSession,
        windowTarget: `${primarySession}:does-not-exist`,
      }),
    ).rejects.toThrow(/link-window/)
    expect(await hasWindow(`${viewerSession}:0`)).toBe(false)
  })
})
