import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import * as agentMap from './agent-map'
import { getHookServerPort, startHookServer, stopHookServer } from './hook-server'

let port: number

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  agentMap.__clearForTests()
  port = await startHookServer({ port: 0 })
})

afterEach(async () => {
  await stopHookServer()
  agentMap.__clearForTests()
})

describe('hook-server', () => {
  it('1. accepts a SessionStart POST and records in agent-map', async () => {
    const res = await post('/session-start', {
      session_id: 'sess-1',
      cc_ide_window: 'claude-oreo',
      cwd: '/repo',
    })
    expect(res.status).toBe(200)
    expect(agentMap.getSessionBySessionId('sess-1')?.ccIdeWindow).toBe('claude-oreo')
  })

  it('2. accepts a SubagentStart POST when parent is known', async () => {
    agentMap.onSessionStart({ session_id: 'p1', cc_ide_window: 'claude-x' })
    const res = await post('/subagent-start', {
      session_id: 'p1',
      agent_id: 'a1',
      agent_type: 'Explore',
    })
    expect(res.status).toBe(200)
  })

  it('3. accepts a SubagentStop POST', async () => {
    agentMap.onSessionStart({ session_id: 'p1', cc_ide_window: 'claude-x' })
    const res = await post('/subagent-stop', {
      session_id: 'p1',
      agent_id: 'a1',
      agent_transcript_path: '/tmp/t.jsonl',
      last_assistant_message: 'done',
    })
    expect(res.status).toBe(200)
  })

  it('4. rejects non-POST methods', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/session-start`)
    expect(res.status).toBe(405)
  })

  it('5. 404s on unknown route', async () => {
    const res = await post('/nope', { session_id: 'x' })
    expect(res.status).toBe(404)
  })

  it('6. 400s on invalid JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/session-start`, {
      method: 'POST',
      body: '{ not json',
    })
    expect(res.status).toBe(400)
  })

  it('7. 400s on schema violation (missing required field)', async () => {
    const res = await post('/session-start', { not: 'the right shape' })
    expect(res.status).toBe(400)
  })

  it('8. getHookServerPort reflects listening port', () => {
    expect(getHookServerPort()).toBe(port)
  })
})
