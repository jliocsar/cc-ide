import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setDataPathForTests,
  defaultSettings,
  readSettings,
  updateSettings,
} from './settings-store'

let tmpDir: string
let settingsPath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'settings-store-test-'))
  settingsPath = join(tmpDir, 'settings.json')
  __setDataPathForTests(settingsPath)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('1. missing file returns defaults', async () => {
    const s = await readSettings()
    expect(s).toEqual(defaultSettings)
    expect(s.editor.keybinds).toBe('vscode')
  })

  it('2. updateSettings writes atomically and returns merged result', async () => {
    const next = await updateSettings({ editor: { keybinds: 'vim' } })
    expect(next.editor.keybinds).toBe('vim')
    const reread = await readSettings()
    expect(reread.editor.keybinds).toBe('vim')
  })

  it('3. updateSettings deep-merges partial patches', async () => {
    await updateSettings({ editor: { keybinds: 'vim' } })
    const partial = await updateSettings({})
    expect(partial.editor.keybinds).toBe('vim')
  })

  it('4. survives corrupt file — read returns defaults, subsequent write succeeds', async () => {
    await fs.writeFile(settingsPath, '<<< not json >>>', 'utf8')
    const s = await readSettings()
    expect(s).toEqual(defaultSettings)

    const next = await updateSettings({ editor: { keybinds: 'vim' } })
    expect(next.editor.keybinds).toBe('vim')
    const reread = await readSettings()
    expect(reread.editor.keybinds).toBe('vim')
  })

  it('5. rejects invalid keybinds value', async () => {
    await expect(
      updateSettings({ editor: { keybinds: 'emacs' as unknown as 'vim' } }),
    ).rejects.toThrow()
  })

  it('6. atomic write leaves no .tmp artifact on success', async () => {
    await updateSettings({ editor: { keybinds: 'vim' } })
    const entries = await fs.readdir(tmpDir)
    expect(entries).toContain('settings.json')
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false)
  })

  it('7. schema version mismatch returns defaults (forward-compat)', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ version: 99, settings: { editor: { keybinds: 'vim' } } }),
      'utf8',
    )
    const s = await readSettings()
    expect(s).toEqual(defaultSettings)
  })
})
