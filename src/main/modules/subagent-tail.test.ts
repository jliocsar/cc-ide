import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const broadcastSpy = vi.fn()
vi.mock('../event-bus', () => ({
  broadcast: (channel: string, payload: unknown) => broadcastSpy(channel, payload),
}))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import {
  __activeWatcherKeysForTests,
  __setRootForTests,
  disposeAll,
  parseJsonlLine,
  startTail,
  stopTail,
} from './subagent-tail'

let tmp: string

function slug(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

async function writeTranscript(
  cwd: string,
  parentSid: string,
  agentId: string,
  lines: string[],
): Promise<string> {
  const dir = join(tmp, slug(cwd), parentSid, 'subagents')
  await fs.mkdir(dir, { recursive: true })
  const path = join(dir, `agent-${agentId}.jsonl`)
  await fs.writeFile(path, lines.map((l) => `${l}\n`).join(''))
  return path
}

async function appendTranscript(path: string, lines: string[]): Promise<void> {
  await fs.appendFile(path, lines.map((l) => `${l}\n`).join(''))
}

function firstEntry<T>(payload: unknown): T {
  const p = payload as { entries?: T[] } | undefined
  const entries = p?.entries ?? []
  if (entries.length === 0) throw new Error('expected at least one entry')
  return entries[0] as T
}

beforeEach(async () => {
  broadcastSpy.mockReset()
  tmp = await fs.mkdtemp(join(tmpdir(), 'subagent-tail-test-'))
  __setRootForTests(tmp)
})

afterEach(async () => {
  disposeAll()
  await fs.rm(tmp, { recursive: true, force: true })
  __setRootForTests(null)
})

describe('parseJsonlLine', () => {
  it('1. parses an assistant tool_use entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'abc',
      timestamp: '2026-04-20T10:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }],
      },
    })
    const entry = firstEntry<{ kind: string; toolName?: string; toolUseId?: string }>({
      entries: parseJsonlLine(line),
    })
    expect(entry.kind).toBe('tool-use')
    expect(entry.toolName).toBe('Bash')
    expect(entry.toolUseId).toBe('toolu_1')
  })

  it('2. parses an assistant text entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'abc',
      timestamp: '2026-04-20T10:00:00.000Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    })
    const entry = firstEntry<{ kind: string; text?: string }>({ entries: parseJsonlLine(line) })
    expect(entry.kind).toBe('assistant-text')
    expect(entry.text).toBe('hello')
  })

  it('3. parses a user tool_result entry', () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: 'abc',
      timestamp: '2026-04-20T10:00:00.000Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [{ type: 'text', text: 'done' }],
            is_error: false,
          },
        ],
      },
    })
    const entry = firstEntry<{
      kind: string
      toolUseId?: string
      text?: string
      isError?: boolean
    }>({ entries: parseJsonlLine(line) })
    expect(entry.kind).toBe('tool-result')
    expect(entry.toolUseId).toBe('toolu_1')
    expect(entry.text).toBe('done')
    expect(entry.isError).toBe(false)
  })

  it('4. ignores non-assistant/user types (agent-setting, permission-mode)', () => {
    expect(parseJsonlLine(JSON.stringify({ type: 'agent-setting', sessionId: 'x' }))).toEqual([])
    expect(parseJsonlLine(JSON.stringify({ type: 'permission-mode', sessionId: 'x' }))).toEqual([])
  })

  it('5. returns null on malformed JSON', () => {
    expect(parseJsonlLine('{ not json')).toBeNull()
  })
})

describe('subagent-tail — live file', () => {
  it('6. reads initial content + appended lines; stops on stopTail', async () => {
    const cwd = '/home/jc/repo'
    const path = await writeTranscript(cwd, 'parent-sid', 'a1', [
      JSON.stringify({
        type: 'assistant',
        uuid: 'u1',
        timestamp: '2026-04-20T10:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'first' }] },
      }),
    ])

    await startTail({ parentSessionId: 'parent-sid', agentId: 'a1', cwd })
    await new Promise((r) => setTimeout(r, 100))

    expect(broadcastSpy).toHaveBeenCalled()
    const firstCall = broadcastSpy.mock.calls[0] ?? []
    expect(firstCall[0]).toBe('agent:subagentTranscriptLine')
    const firstEntryObj = firstEntry<{ kind: string; text?: string }>(firstCall[1])
    expect(firstEntryObj.kind).toBe('assistant-text')
    expect(firstEntryObj.text).toBe('first')

    broadcastSpy.mockReset()
    await appendTranscript(path, [
      JSON.stringify({
        type: 'assistant',
        uuid: 'u2',
        timestamp: '2026-04-20T10:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
      }),
    ])
    await new Promise((r) => setTimeout(r, 700))
    expect(broadcastSpy).toHaveBeenCalled()
    const secondCall = broadcastSpy.mock.calls[0] ?? []
    const secondEntry = firstEntry<{ text?: string }>(secondCall[1])
    expect(secondEntry.text).toBe('second')

    stopTail({ parentSessionId: 'parent-sid', agentId: 'a1' })
    await new Promise((r) => setTimeout(r, 50))
    expect(__activeWatcherKeysForTests()).not.toContain('parent-sid::a1')
  })

  it('7. tolerates a late-arriving transcript file (starts before file exists)', async () => {
    const cwd = '/home/jc/repo'
    const p = startTail({ parentSessionId: 'parent-sid', agentId: 'a2', cwd })
    await new Promise((r) => setTimeout(r, 200))
    await writeTranscript(cwd, 'parent-sid', 'a2', [
      JSON.stringify({
        type: 'assistant',
        uuid: 'u1',
        timestamp: '2026-04-20T10:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      }),
    ])
    await p
    await new Promise((r) => setTimeout(r, 800))
    expect(broadcastSpy).toHaveBeenCalled()
    stopTail({ parentSessionId: 'parent-sid', agentId: 'a2' })
  })

  it('8. concurrent tails for different (parent, agent) pairs are independent', async () => {
    const cwd = '/home/jc/repo'
    await writeTranscript(cwd, 'p1', 'a1', [
      JSON.stringify({
        type: 'assistant',
        uuid: 'u',
        timestamp: '2026-04-20T10:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'from a1' }] },
      }),
    ])
    await writeTranscript(cwd, 'p1', 'a2', [
      JSON.stringify({
        type: 'assistant',
        uuid: 'u',
        timestamp: '2026-04-20T10:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'from a2' }] },
      }),
    ])
    await startTail({ parentSessionId: 'p1', agentId: 'a1', cwd })
    await startTail({ parentSessionId: 'p1', agentId: 'a2', cwd })
    await new Promise((r) => setTimeout(r, 150))
    const seen = broadcastSpy.mock.calls.map(
      ([, payload]) => (payload as { agentId: string }).agentId,
    )
    expect(seen).toContain('a1')
    expect(seen).toContain('a2')
    stopTail({ parentSessionId: 'p1', agentId: 'a1' })
    stopTail({ parentSessionId: 'p1', agentId: 'a2' })
  })
})
