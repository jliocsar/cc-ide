import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToSlug, listSessions, listSessionsBySlug } from './session-discovery'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionLine(type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...extra })
}

function makeUserLine(
  content: string | unknown[],
  ts: string,
  extra: Record<string, unknown> = {},
): string {
  return makeSessionLine('user', {
    parentUuid: null,
    isSidechain: false,
    message: { role: 'user', content },
    uuid: randomUUID(),
    timestamp: ts,
    userType: 'external',
    ...extra,
  })
}

function makeAssistantLine(ts: string): string {
  return makeSessionLine('assistant', {
    parentUuid: randomUUID(),
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    requestId: randomUUID(),
    uuid: randomUUID(),
    timestamp: ts,
    userType: 'external',
  })
}

async function writeSession(dir: string, id: string, lines: string[]): Promise<string> {
  const filePath = join(dir, `${id}.jsonl`)
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8')
  return filePath
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpRoot: string
let projectSlug: string
let projectDir: string

beforeEach(async () => {
  tmpRoot = join(tmpdir(), `cc-ide-test-${randomUUID()}`)
  projectSlug = '-home-testuser-Projects-myapp'
  projectDir = join(tmpRoot, projectSlug)
  await fs.mkdir(projectDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// pathToSlug
// ---------------------------------------------------------------------------

describe('pathToSlug', () => {
  it('converts the documented example', () => {
    expect(pathToSlug('/home/jliocsar/Projects/cc-ide')).toBe('-home-jliocsar-Projects-cc-ide')
  })

  it('handles deep nesting with dots', () => {
    // Leading slash → leading dash is intentional; matches Claude on-disk dir names
    expect(pathToSlug('/home/user/work/my.company/deep/path')).toBe(
      '-home-user-work-my-company-deep-path',
    )
  })

  it('leading dash is preserved (matches Claude on-disk behaviour)', () => {
    expect(pathToSlug('/home/jliocsar/Projects/cc-ide')).toBe('-home-jliocsar-Projects-cc-ide')
  })
})

// ---------------------------------------------------------------------------
// listSessions — no project folder
// ---------------------------------------------------------------------------

describe('listSessions — missing directory', () => {
  it('returns empty array when project folder does not exist', async () => {
    const result = await listSessions('/non/existent/path', tmpRoot)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// listSessions — single valid file
// ---------------------------------------------------------------------------

describe('listSessions — single valid file', () => {
  it('reads id, messageCount, firstUserMessage, uses last-line ts as updatedAt', async () => {
    const id = randomUUID()
    const lines = [
      makeSessionLine('permission-mode', { permissionMode: 'default', sessionId: id }),
      makeUserLine('Hello, Claude!', '2026-01-01T10:00:00.000Z'),
      makeAssistantLine('2026-01-01T10:00:05.000Z'),
    ]
    await writeSession(projectDir, id, lines)

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session).toBeDefined()
    if (!session) return

    expect(session.id).toBe(id)
    expect(session.slug).toBe(projectSlug)
    expect(session.messageCount).toBe(3)
    expect(session.firstUserMessage).toBe('Hello, Claude!')
    expect(session.createdAt).toBe(Date.parse('2026-01-01T10:00:00.000Z'))
    expect(session.updatedAt).toBe(Date.parse('2026-01-01T10:00:05.000Z'))
  })
})

// ---------------------------------------------------------------------------
// listSessions — malformed lines
// ---------------------------------------------------------------------------

describe('listSessions — malformed lines', () => {
  it('skips bad JSON but counts valid lines', async () => {
    const id = randomUUID()
    const lines = [
      makeUserLine('First valid', '2026-01-01T09:00:00.000Z'),
      'THIS IS NOT JSON }{{{',
      '',
      makeAssistantLine('2026-01-01T09:00:03.000Z'),
      '{broken',
      makeUserLine([{ type: 'text', text: 'Second valid' }], '2026-01-01T09:00:06.000Z'),
    ]
    await writeSession(projectDir, id, lines)

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session).toBeDefined()
    if (!session) return

    // 3 valid JSON lines: user, assistant, user — malformed/empty are skipped
    expect(session.messageCount).toBe(3)
    expect(session.firstUserMessage).toBe('First valid')
  })
})

// ---------------------------------------------------------------------------
// listSessions — multiple files sorted by updatedAt desc
// ---------------------------------------------------------------------------

describe('listSessions — sorting', () => {
  it('sorts multiple sessions by updatedAt descending', async () => {
    const oldId = randomUUID()
    const newId = randomUUID()
    const middleId = randomUUID()

    await writeSession(projectDir, oldId, [makeUserLine('old', '2026-01-01T08:00:00.000Z')])
    await writeSession(projectDir, newId, [makeUserLine('new', '2026-01-03T12:00:00.000Z')])
    await writeSession(projectDir, middleId, [makeUserLine('middle', '2026-01-02T10:00:00.000Z')])

    const sessions = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(sessions).toHaveLength(3)
    expect(sessions[0]?.id).toBe(newId)
    expect(sessions[1]?.id).toBe(middleId)
    expect(sessions[2]?.id).toBe(oldId)
  })
})

// ---------------------------------------------------------------------------
// listSessionsBySlug — works independently
// ---------------------------------------------------------------------------

describe('listSessionsBySlug', () => {
  it('resolves by slug without going through path derivation', async () => {
    const id = randomUUID()
    await writeSession(projectDir, id, [
      makeUserLine('direct slug call', '2026-02-15T09:30:00.000Z'),
    ])

    const sessions = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe(id)
  })
})

// ---------------------------------------------------------------------------
// firstUserMessage truncation
// ---------------------------------------------------------------------------

describe('firstUserMessage truncation', () => {
  it('truncates at exactly 140 chars', async () => {
    const id = randomUUID()
    const long = 'A'.repeat(200)
    await writeSession(projectDir, id, [makeUserLine(long, '2026-03-01T00:00:00.000Z')])

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session).toBeDefined()
    if (!session) return

    expect(session.firstUserMessage).toHaveLength(140)
    expect(session.firstUserMessage).toBe('A'.repeat(140))
  })

  it('does not truncate messages under 140 chars', async () => {
    const id = randomUUID()
    const short = 'B'.repeat(80)
    await writeSession(projectDir, id, [makeUserLine(short, '2026-03-01T00:00:00.000Z')])

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session?.firstUserMessage).toBe(short)
  })
})

// ---------------------------------------------------------------------------
// listSessions — falls back to mtime when no timestamps in file
// ---------------------------------------------------------------------------

describe('listSessions — mtime fallback', () => {
  it('uses file mtime when no parseable timestamps exist in any line', async () => {
    const id = randomUUID()
    // Lines have no timestamp field
    const lines = [
      JSON.stringify({ type: 'permission-mode', permissionMode: 'default' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    ]
    const filePath = await writeSession(projectDir, id, lines)

    const stat = await fs.stat(filePath)
    const sessions = await listSessionsBySlug(projectSlug, tmpRoot)

    expect(sessions[0]?.updatedAt).toBe(stat.mtimeMs)
    expect(sessions[0]?.createdAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// listSessions — skips meta & tool-result user lines for firstUserMessage
// ---------------------------------------------------------------------------

describe('listSessions — firstUserMessage extraction', () => {
  it('ignores isMeta=true lines and toolUseResult lines', async () => {
    const id = randomUUID()
    const lines = [
      makeUserLine('meta content', '2026-04-01T00:00:00.000Z', { isMeta: true }),
      makeUserLine([{ type: 'tool_result', text: 'result' }], '2026-04-01T00:00:01.000Z', {
        toolUseResult: true,
      }),
      makeUserLine('Real first message', '2026-04-01T00:00:02.000Z'),
    ]
    await writeSession(projectDir, id, lines)

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session?.firstUserMessage).toBe('Real first message')
  })

  it('picks text from array content', async () => {
    const id = randomUUID()
    const lines = [
      makeUserLine([{ type: 'text', text: 'Array text content' }], '2026-04-01T00:00:00.000Z'),
    ]
    await writeSession(projectDir, id, lines)

    const [session] = await listSessionsBySlug(projectSlug, tmpRoot)
    expect(session?.firstUserMessage).toBe('Array text content')
  })
})
