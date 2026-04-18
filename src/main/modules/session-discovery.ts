import { createReadStream, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'

const DEFAULT_ROOT = join(homedir(), '.claude', 'projects')

const FIRST_USER_MSG_MAX = 140

export type SessionSummary = {
  id: string
  slug: string
  path: string
  updatedAt: number
  createdAt: number | null
  firstUserMessage: string | null
  messageCount: number
}

/** Derive the Claude project slug from an absolute workspace path.
 *  Replace every `/` and `.` with `-`.  The leading slash → leading dash is
 *  intentional — Claude's on-disk folders are named that way. */
export function pathToSlug(workspaceAbsPath: string): string {
  return workspaceAbsPath.replace(/[/.]/g, '-')
}

function parseTimestamp(ts: unknown): number | null {
  if (typeof ts !== 'string') return null
  const ms = Date.parse(ts)
  return Number.isFinite(ms) ? ms : null
}

function extractFirstUserText(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (
        item !== null &&
        typeof item === 'object' &&
        'type' in item &&
        (item as Record<string, unknown>)['type'] === 'text'
      ) {
        const text = (item as Record<string, unknown>)['text']
        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim()
        }
      }
    }
  }
  return null
}

interface ParsedLine {
  type: string | null
  timestamp: number | null
  isMeta: boolean
  userMessage: string | null
}

function parseLine(raw: string): ParsedLine | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (obj === null || typeof obj !== 'object') return null

  const rec = obj as Record<string, unknown>
  const type = typeof rec['type'] === 'string' ? rec['type'] : null
  const timestamp = parseTimestamp(rec['timestamp'])
  const isMeta = rec['isMeta'] === true

  let userMessage: string | null = null
  if (type === 'user' && !isMeta && !('toolUseResult' in rec)) {
    const msg = rec['message']
    if (msg !== null && typeof msg === 'object') {
      const msgRec = msg as Record<string, unknown>
      userMessage = extractFirstUserText(msgRec['content'])
    }
  }

  return { type, timestamp, isMeta, userMessage }
}

async function parseSessionFile(filePath: string, slug: string): Promise<SessionSummary> {
  const stat = await fs.stat(filePath)
  const id = basename(filePath, '.jsonl')

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let messageCount = 0
  let createdAt: number | null = null
  let updatedAt: number | null = null
  let firstUserMessage: string | null = null

  for await (const raw of rl) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue

    const parsed = parseLine(trimmed)
    if (parsed === null) continue

    messageCount++

    if (parsed.timestamp !== null) {
      if (createdAt === null) createdAt = parsed.timestamp
      updatedAt = parsed.timestamp
    }

    if (firstUserMessage === null && parsed.userMessage !== null) {
      firstUserMessage =
        parsed.userMessage.length > FIRST_USER_MSG_MAX
          ? parsed.userMessage.slice(0, FIRST_USER_MSG_MAX)
          : parsed.userMessage
    }
  }

  return {
    id,
    slug,
    path: filePath,
    updatedAt: updatedAt ?? stat.mtimeMs,
    createdAt,
    firstUserMessage,
    messageCount,
  }
}

// Cap parallel parses so a workspace with hundreds of sessions doesn't open
// hundreds of read streams at once. 8 is enough to saturate fs read while
// staying well under typical fd ulimits.
const PARSE_CONCURRENCY = 8

async function mapBounded<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

export async function listSessionsBySlug(
  slug: string,
  rootDir: string = DEFAULT_ROOT,
): Promise<SessionSummary[]> {
  const dir = join(rootDir, slug)

  let entries: string[]
  try {
    const raw = await fs.readdir(dir)
    entries = raw.filter((name) => name.endsWith('.jsonl'))
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const results = await mapBounded(entries, PARSE_CONCURRENCY, (name) =>
    parseSessionFile(join(dir, name), slug),
  )

  return results.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listSessions(
  workspaceAbsPath: string,
  rootDir: string = DEFAULT_ROOT,
): Promise<SessionSummary[]> {
  const slug = pathToSlug(workspaceAbsPath)
  return listSessionsBySlug(slug, rootDir)
}
