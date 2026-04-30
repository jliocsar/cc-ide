import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __setSpawnScriptRootForTests, buildSpawnScript, writeSpawnScript } from './spawn-script'

describe('buildSpawnScript', () => {
  it('emits CC_IDE_WINDOW + bare claude exec', () => {
    const s = buildSpawnScript({ windowName: 'claude-foo' })
    expect(s).toContain('export CC_IDE_WINDOW="claude-foo"')
    expect(s).toContain('exec claude\n')
    expect(s).not.toContain('--dangerously-skip-permissions')
  })

  it('appends --dangerously-skip-permissions when bypassPermissions is true', () => {
    const s = buildSpawnScript({ windowName: 'w', bypassPermissions: true })
    expect(s).toContain('exec claude --dangerously-skip-permissions\n')
  })

  it('passes base64 prompt through printf | base64 -d', () => {
    const b64 = Buffer.from("hello 'world'\n$shell `cmd`").toString('base64')
    const s = buildSpawnScript({ windowName: 'w', initialPromptBase64: b64 })
    expect(s).toContain(`"$(printf '%s' '${b64}' | base64 -d)"`)
  })

  it('exports env vars with shell-expanded values', () => {
    const s = buildSpawnScript({
      windowName: 'w',
      envVars: { FOO: 'bar', PATH_LIKE: '/extra:$PATH' },
    })
    expect(s).toContain('export FOO="bar"')
    expect(s).toContain('export PATH_LIKE="/extra:$PATH"')
  })

  it('escapes ", \\, and backtick in env values but leaves $ for expansion', () => {
    const s = buildSpawnScript({
      windowName: 'w',
      envVars: { K: 'a"b\\c`d$E' },
    })
    expect(s).toContain('export K="a\\"b\\\\c\\`d$E"')
  })

  it('rejects invalid env var names', () => {
    expect(() => buildSpawnScript({ windowName: 'w', envVars: { '1FOO': 'x' } })).toThrow(
      /invalid env var name/,
    )
    expect(() => buildSpawnScript({ windowName: 'w', envVars: { 'FOO BAR': 'x' } })).toThrow(
      /invalid env var name/,
    )
  })

  it('rejects non-base64 initialPrompt', () => {
    expect(() => buildSpawnScript({ windowName: 'w', initialPromptBase64: 'not base64!' })).toThrow(
      /invalid base64/,
    )
  })
})

describe('writeSpawnScript', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cc-ide-spawn-'))
    __setSpawnScriptRootForTests(root)
  })

  afterEach(async () => {
    __setSpawnScriptRootForTests(null)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('writes the script and returns its path', async () => {
    const p = await writeSpawnScript({ windowName: 'claude-x' })
    expect(p).toBe(join(root, 'claude-x.sh'))
    const body = await fs.readFile(p, 'utf8')
    expect(body).toContain('exec claude')
  })

  it('sanitizes window name for filename safety', async () => {
    const p = await writeSpawnScript({ windowName: 'a/b\\c d' })
    expect(p).toBe(join(root, 'a_b_c_d.sh'))
  })
})
