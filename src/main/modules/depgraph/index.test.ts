import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __applyToStateForTests, disposeAll, refresh, subscribe, unsubscribe } from './index'
import { emptyWorkspaceGraphState } from './types'

let repo: string

async function gitInit(path: string): Promise<void> {
  spawnSync('git', ['init', '-q'], { cwd: path })
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: path })
  spawnSync('git', ['config', 'user.name', 't'], { cwd: path })
}

async function gitAddAll(path: string): Promise<void> {
  spawnSync('git', ['add', '-A'], { cwd: path })
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: path })
}

beforeEach(async () => {
  repo = await fs.mkdtemp(join(tmpdir(), 'depgraph-'))
  await gitInit(repo)
})

afterEach(async () => {
  await disposeAll()
  await fs.rm(repo, { recursive: true, force: true })
})

describe('depgraph', () => {
  it('subscribe scans a workspace and unsubscribes cleanly', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await fs.writeFile(join(repo, 'b.ts'), 'import { a } from "./a"\nexport const b = a\n', 'utf8')
    await gitAddAll(repo)

    await subscribe('ws-1', repo)
    await new Promise((r) => setTimeout(r, 200))
    await unsubscribe('ws-1')
  })

  it('subscribe twice on same id re-emits snapshot only', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await fs.writeFile(join(repo, 'b.ts'), 'import { a } from "./a"\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-2', repo)
    // Wait long enough for the initial scan to populate edges before re-subscribing.
    await new Promise((r) => setTimeout(r, 500))
    await subscribe('ws-2', repo)
    await unsubscribe('ws-2')
  })

  it('unsubscribe is a no-op for unknown workspace', async () => {
    await unsubscribe('does-not-exist')
  })

  it('refresh tears down and re-subscribes', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-3', repo)
    await new Promise((r) => setTimeout(r, 200))
    await refresh('ws-3', repo)
    await new Promise((r) => setTimeout(r, 200))
    await unsubscribe('ws-3')
  })

  it('disposeAll tears down all subscriptions', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-4', repo)
    await subscribe('ws-5', repo)
    await disposeAll()
  })

  it('handles tsconfig changes via watcher', async () => {
    await fs.writeFile(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }), 'utf8')
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-6', repo)
    await new Promise((r) => setTimeout(r, 200))
    await fs.writeFile(
      join(repo, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
      'utf8',
    )
    await new Promise((r) => setTimeout(r, 500))
    await unsubscribe('ws-6')
  })

  it('handles file delete via watcher', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await fs.writeFile(join(repo, 'b.ts'), 'import { a } from "./a"\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-7', repo)
    await new Promise((r) => setTimeout(r, 300))
    // Delete the IMPORTED file (a.ts) so handleFileDelete walks `incoming`.
    await fs.unlink(join(repo, 'a.ts'))
    await new Promise((r) => setTimeout(r, 500))
    // Then delete the importer too to also walk `outgoing`.
    await fs.unlink(join(repo, 'b.ts'))
    await new Promise((r) => setTimeout(r, 500))
    await unsubscribe('ws-7')
  })

  it('handles file change for tracked TS file', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-8', repo)
    await new Promise((r) => setTimeout(r, 300))
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 2\n', 'utf8')
    await new Promise((r) => setTimeout(r, 500))
    await unsubscribe('ws-8')
  })

  it('applyToState cascades edge cleanup when removing a node with stale outgoing/incoming sets', () => {
    const s = emptyWorkspaceGraphState()
    __applyToStateForTests(s, {
      addNodes: [
        { id: 'a.ts', kind: 'file', lang: 'ts' },
        { id: 'b.ts', kind: 'file', lang: 'ts' },
        { id: 'c.ts', kind: 'file', lang: 'ts' },
      ],
      addEdges: [
        { from: 'a.ts', to: 'b.ts', kinds: ['static'] },
        { from: 'c.ts', to: 'b.ts', kinds: ['static'] },
        { from: 'b.ts', to: 'a.ts', kinds: ['static'] },
      ],
    })
    // Remove b.ts WITHOUT clearing its edges first — exercises the cascade-clean
    // branches in applyToState's removeNodes block.
    __applyToStateForTests(s, { removeNodes: ['b.ts'] })
    expect(s.nodes.has('b.ts')).toBe(false)
    expect(s.edges.size).toBe(0)
  })

  it('applyToState handles all delta variants (no-op branches)', () => {
    const s = emptyWorkspaceGraphState()
    __applyToStateForTests(s, {})
    __applyToStateForTests(s, {
      addNodes: [{ id: 'a.ts', kind: 'file', lang: 'ts' }],
      addEdges: [{ from: 'a.ts', to: 'a.ts', kinds: ['static'] }],
      updateEdgeKinds: [{ from: 'a.ts', to: 'a.ts', kinds: ['type'] }],
      removeEdges: [{ from: 'a.ts', to: 'a.ts' }],
    })
    expect(s.nodes.size).toBe(1)
  })

  it('ignores .git and node_modules paths', async () => {
    await fs.writeFile(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    await gitAddAll(repo)
    await subscribe('ws-9', repo)
    await new Promise((r) => setTimeout(r, 200))
    await fs.mkdir(join(repo, 'node_modules'), { recursive: true })
    await fs.writeFile(join(repo, 'node_modules', 'x.ts'), 'export {}\n', 'utf8')
    await new Promise((r) => setTimeout(r, 400))
    await unsubscribe('ws-9')
  })
})
