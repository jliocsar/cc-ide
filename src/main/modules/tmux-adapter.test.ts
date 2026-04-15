import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  ensureSession,
  hasWindow,
  killWindow,
  listWindows,
  renameWindow,
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
