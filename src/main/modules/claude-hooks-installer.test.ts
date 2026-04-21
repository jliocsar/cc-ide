import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setClaudeSettingsPathForTests,
  __setHooksDirForTests,
  ensureClaudeHooksInstalled,
  installHookScripts,
  patchClaudeSettings,
} from './claude-hooks-installer'

let tmpDir: string
let settingsPath: string
let hooksDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'cc-ide-hooks-test-'))
  settingsPath = join(tmpDir, 'settings.json')
  hooksDir = join(tmpDir, '.cc-ide', 'hooks')
  __setClaudeSettingsPathForTests(settingsPath)
  __setHooksDirForTests(hooksDir)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('claude-hooks-installer', () => {
  it('1. installs a single hook script and makes it executable', async () => {
    await installHookScripts({ port: 9224 })
    const script = join(hooksDir, 'cc-ide-hook.sh')
    const stat = await fs.stat(script)
    expect(stat.isFile()).toBe(true)
    // 0o111 → any execute bit set
    expect(stat.mode & 0o111).not.toBe(0)
    const body = await fs.readFile(script, 'utf8')
    expect(body).toContain('#!/usr/bin/env bash')
    expect(body).toContain('http://127.0.0.1:9224/')
  })

  it('2. creates hooks section in empty settings', async () => {
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(parsed.hooks.SessionStart).toHaveLength(1)
    expect(parsed.hooks.SubagentStart).toHaveLength(1)
    expect(parsed.hooks.SubagentStop).toHaveLength(1)
    const cmd = parsed.hooks.SessionStart[0].hooks[0].command as string
    expect(cmd).toContain('cc-ide-hook.sh')
    expect(cmd).toContain('session-start')
  })

  it('3. preserves unrelated settings keys', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        env: { FOO: 'bar' },
        permissions: { allow: ['Bash(ls:*)'] },
      }),
    )
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(parsed.env.FOO).toBe('bar')
    expect(parsed.permissions.allow).toEqual(['Bash(ls:*)'])
    expect(parsed.hooks.SessionStart).toBeDefined()
  })

  it('4. preserves pre-existing non-cc-ide hooks in same event array', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [
                { type: 'command', command: 'bash ~/.tmux/plugins/foo/hook.sh session-start' },
              ],
            },
          ],
        },
      }),
    )
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(parsed.hooks.SessionStart).toHaveLength(2)
    // existing foo hook preserved
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toContain('foo/hook.sh')
    // ours appended
    expect(parsed.hooks.SessionStart[1].hooks[0].command).toContain('cc-ide-hook.sh')
  })

  it('5. is idempotent — repeat runs keep a single cc-ide entry per event', async () => {
    await patchClaudeSettings()
    await patchClaudeSettings()
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    for (const event of ['SessionStart', 'SubagentStart', 'SubagentStop']) {
      const list = parsed.hooks[event] as Array<{ hooks: Array<{ command: string }> }>
      const ours = list.filter((e) => e.hooks[0]!.command.includes('cc-ide-hook.sh'))
      expect(ours).toHaveLength(1)
    }
  })

  it('6. replaces a stale cc-ide entry (e.g. old port) with the new one', async () => {
    // Manually plant an old ours entry pointing at a different port.
    await fs.mkdir(hooksDir, { recursive: true })
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [
                {
                  type: 'command',
                  command: `bash ${hooksDir}/cc-ide-hook.sh session-start --stale`,
                },
              ],
            },
          ],
        },
      }),
    )
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    const list = parsed.hooks.SessionStart as Array<{ hooks: Array<{ command: string }> }>
    expect(list).toHaveLength(1)
    expect(list[0]!.hooks[0]!.command).not.toContain('--stale')
  })

  it('7. ensureClaudeHooksInstalled runs both installer + patcher', async () => {
    await ensureClaudeHooksInstalled({ port: 9225 })
    const script = join(hooksDir, 'cc-ide-hook.sh')
    expect((await fs.stat(script)).isFile()).toBe(true)
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(parsed.hooks.SessionStart).toHaveLength(1)
    const body = await fs.readFile(script, 'utf8')
    expect(body).toContain('9225')
  })

  it('8. tolerates corrupt settings.json by backing up and starting fresh', async () => {
    await fs.writeFile(settingsPath, '<<< not json >>>')
    await patchClaudeSettings()
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(parsed.hooks.SessionStart).toHaveLength(1)
    const entries = await fs.readdir(tmpDir)
    expect(entries.some((e) => e.includes('cc-ide-corrupt'))).toBe(true)
  })
})
