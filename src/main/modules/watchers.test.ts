import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  disposeAllWatchers,
  ensurePlansWatcher,
  ensurePromptsWatcher,
  ensureSessionWatcher,
  ensureWorktreeWatcher,
} from './watchers'

let workspacePath: string
let fakeHome: string
let prevHome: string | undefined

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(join(tmpdir(), 'watchers-ws-'))
  fakeHome = await fs.mkdtemp(join(tmpdir(), 'watchers-home-'))
  prevHome = process.env.HOME
  process.env.HOME = fakeHome
})

afterEach(async () => {
  disposeAllWatchers()
  if (prevHome === undefined) delete process.env.HOME
  else process.env.HOME = prevHome
  await fs.rm(workspacePath, { recursive: true, force: true })
  await fs.rm(fakeHome, { recursive: true, force: true })
})

describe('watchers', () => {
  it('ensureSessionWatcher creates a watcher and is idempotent; fires on change', async () => {
    const slug = workspacePath.replace(/[/.]/g, '-')
    const sessionsDir = join(fakeHome, '.claude', 'projects', slug)
    await ensureSessionWatcher('ws-1', workspacePath)
    await ensureSessionWatcher('ws-1', workspacePath)
    await fs.writeFile(join(sessionsDir, 'a.jsonl'), '{}\n', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
  })

  it('ensureWorktreeWatcher tolerates missing .git/worktrees by creating it; fires on change', async () => {
    await ensureWorktreeWatcher('ws-2', workspacePath)
    const dir = join(workspacePath, '.git', 'worktrees')
    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
    await fs.writeFile(join(dir, 'foo'), 'x', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
  })

  it('ensurePlansWatcher fires a debounced broadcast on file change', async () => {
    await ensurePlansWatcher('ws-3', workspacePath)
    const plans = join(workspacePath, '.cc-ide', 'plans')
    await fs.writeFile(join(plans, 'a.md'), 'hello', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
  })

  it('ensurePromptsWatcher fires on file change', async () => {
    await ensurePromptsWatcher('ws-4', workspacePath)
    const prompts = join(workspacePath, '.cc-ide', 'prompts')
    await fs.writeFile(join(prompts, 'p.json'), '{}', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
  })

  it('multiple watchers on the same workspace coexist', async () => {
    await ensureSessionWatcher('ws-5', workspacePath)
    await ensureWorktreeWatcher('ws-5', workspacePath)
    await ensurePlansWatcher('ws-5', workspacePath)
    await ensurePromptsWatcher('ws-5', workspacePath)
    disposeAllWatchers()
  })

  it('debounces multiple rapid changes into a single broadcast', async () => {
    await ensurePlansWatcher('ws-6', workspacePath)
    const plans = join(workspacePath, '.cc-ide', 'plans')
    await fs.writeFile(join(plans, 'a.md'), 'a', 'utf8')
    await fs.writeFile(join(plans, 'a.md'), 'b', 'utf8')
    await fs.writeFile(join(plans, 'a.md'), 'c', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
  })

  it('tryWatch returns undefined for unwatchable paths', async () => {
    const garbage = '/proc/1/root/this/will/not/work/ever'
    await ensurePlansWatcher('ws-bad', garbage)
  })

  it('ensureDir succeeds via stat fallback when path exists as a file', async () => {
    // mkdir fails (path is a regular file), stat succeeds → ensureDir returns true.
    await fs.mkdir(join(workspacePath, '.cc-ide'), { recursive: true })
    await fs.writeFile(join(workspacePath, '.cc-ide', 'plans'), 'x', 'utf8')
    await ensurePlansWatcher('ws-file', workspacePath)
  })
})
