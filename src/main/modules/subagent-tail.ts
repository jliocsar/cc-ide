import { type FSWatcher, promises as fs, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TranscriptEntry } from '@shared/ipc'
import { broadcast } from '../event-bus'
import { agentEvents } from './agent-map'

// Tails subagent transcript jsonl files live and emits parsed entries via
// `agent:subagentTranscriptLine` to the renderer. Started on `subagentStart`
// (Node emitter) and stopped on `subagentStop`. Path is deterministic:
// ~/.claude/projects/<cwd-slug>/<parent-sid>/subagents/agent-<agent-id>.jsonl

const TRANSCRIPTS_ROOT = join(homedir(), '.claude', 'projects')

let rootOverride: string | null = null
export function __setRootForTests(p: string | null): void {
  rootOverride = p
}

function root(): string {
  return rootOverride ?? TRANSCRIPTS_ROOT
}

// `session-discovery.ts` uses the same transformation: replace every `/` and
// `.` with `-`. Keep in sync.
function cwdSlug(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

function transcriptPathFor(cwd: string, parentSessionId: string, agentId: string): string {
  return join(root(), cwdSlug(cwd), parentSessionId, 'subagents', `agent-${agentId}.jsonl`)
}

type Watcher = {
  key: string
  path: string
  parentSessionId: string
  agentId: string
  offset: number
  buffer: string
  watcher: FSWatcher | null
  poll: NodeJS.Timeout | null
  closed: boolean
}

const watchers = new Map<string, Watcher>()

function keyFor(parentSessionId: string, agentId: string): string {
  return `${parentSessionId}::${agentId}`
}

export function __activeWatcherKeysForTests(): string[] {
  return [...watchers.keys()]
}

async function readAppended(w: Watcher): Promise<void> {
  if (w.closed) return
  let fd: fs.FileHandle | null = null
  try {
    fd = await fs.open(w.path, 'r')
    const stat = await fd.stat()
    if (stat.size <= w.offset) return
    const toRead = stat.size - w.offset
    const buf = Buffer.alloc(toRead)
    await fd.read(buf, 0, toRead, w.offset)
    w.offset = stat.size
    w.buffer += buf.toString('utf8')
    const lines = w.buffer.split('\n')
    // The last element is whatever came after the final \n — may be partial.
    w.buffer = lines.pop() ?? ''
    const entries: TranscriptEntry[] = []
    for (const raw of lines) {
      if (!raw.trim()) continue
      const parsed = parseJsonlLine(raw)
      if (parsed) entries.push(...parsed)
    }
    if (entries.length > 0) {
      broadcast('agent:subagentTranscriptLine', {
        parentSessionId: w.parentSessionId,
        agentId: w.agentId,
        entries,
      })
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    console.error(`[subagent-tail] read failed for ${w.path}:`, err)
  } finally {
    if (fd) await fd.close().catch(() => {})
  }
}

// Parses one jsonl line into zero-or-more transcript entries. Unknown/meta
// lines return []. Tool-use and tool-result both live on multi-element
// content arrays, so one raw line can expand to multiple entries.
export function parseJsonlLine(raw: string): TranscriptEntry[] | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  const type = typeof rec['type'] === 'string' ? (rec['type'] as string) : null
  if (type !== 'assistant' && type !== 'user') return []

  const uuid = typeof rec['uuid'] === 'string' ? (rec['uuid'] as string) : ''
  const ts = typeof rec['timestamp'] === 'string' ? Date.parse(rec['timestamp'] as string) : NaN
  const tsNum = Number.isFinite(ts) ? ts : Date.now()

  const msg = rec['message']
  if (!msg || typeof msg !== 'object') return []
  const msgRec = msg as Record<string, unknown>
  const content = msgRec['content']
  const out: TranscriptEntry[] = []

  if (type === 'assistant') {
    if (!Array.isArray(content)) return []
    for (const [i, item] of content.entries()) {
      if (!item || typeof item !== 'object') continue
      const c = item as Record<string, unknown>
      if (c['type'] === 'text' && typeof c['text'] === 'string') {
        const text = (c['text'] as string).trim()
        if (text) {
          out.push({ uuid: `${uuid}:t${i}`, ts: tsNum, kind: 'assistant-text', text })
        }
      } else if (c['type'] === 'tool_use') {
        const toolName = typeof c['name'] === 'string' ? (c['name'] as string) : 'unknown'
        const toolUseId = typeof c['id'] === 'string' ? (c['id'] as string) : ''
        out.push({
          uuid: `${uuid}:u${i}`,
          ts: tsNum,
          kind: 'tool-use',
          toolName,
          toolInput: c['input'],
          toolUseId,
        })
      }
    }
    return out
  }

  // type === 'user'
  if (typeof content === 'string' && content.trim()) {
    out.push({ uuid: `${uuid}:u0`, ts: tsNum, kind: 'user-text', text: content.trim() })
    return out
  }
  if (Array.isArray(content)) {
    for (const [i, item] of content.entries()) {
      if (!item || typeof item !== 'object') continue
      const c = item as Record<string, unknown>
      if (c['type'] === 'tool_result') {
        const toolUseId = typeof c['tool_use_id'] === 'string' ? (c['tool_use_id'] as string) : ''
        const text = extractToolResultText(c['content'])
        const isError = c['is_error'] === true
        out.push({
          uuid: `${uuid}:r${i}`,
          ts: tsNum,
          kind: 'tool-result',
          toolUseId,
          text,
          isError,
        })
      } else if (c['type'] === 'text' && typeof c['text'] === 'string') {
        const text = (c['text'] as string).trim()
        if (text) {
          out.push({ uuid: `${uuid}:t${i}`, ts: tsNum, kind: 'user-text', text })
        }
      }
    }
  }
  return out
}

function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const c = item as Record<string, unknown>
      if (c['type'] === 'text' && typeof c['text'] === 'string') chunks.push(c['text'] as string)
    }
    return chunks.join('\n')
  }
  return ''
}

async function startWatcher(w: Watcher): Promise<void> {
  // First read whatever is already on disk.
  await readAppended(w)
  if (w.closed) return
  // Watch for appends.
  try {
    w.watcher = watch(w.path, { persistent: false }, () => {
      void readAppended(w)
    })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[subagent-tail] watch failed for ${w.path}:`, err)
    }
  }
  // Cheap safety-net poll at 500ms. fs.watch misses appends on some file
  // systems; this guarantees forward progress without hammering stat.
  w.poll = setInterval(() => {
    void readAppended(w)
  }, 500)
}

async function waitForFile(path: string, timeoutMs = 3000, intervalMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fs.access(path)
      return true
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return false
}

export async function startTail(opts: {
  parentSessionId: string
  agentId: string
  cwd: string
}): Promise<void> {
  const key = keyFor(opts.parentSessionId, opts.agentId)
  if (watchers.has(key)) return
  const path = transcriptPathFor(opts.cwd, opts.parentSessionId, opts.agentId)
  const w: Watcher = {
    key,
    path,
    parentSessionId: opts.parentSessionId,
    agentId: opts.agentId,
    offset: 0,
    buffer: '',
    watcher: null,
    poll: null,
    closed: false,
  }
  watchers.set(key, w)
  // File may not exist yet at SubagentStart; retry briefly before giving up.
  const exists = await waitForFile(path)
  if (!exists) {
    // Keep the watcher registered but idle — Stop will still clean up.
    return
  }
  await startWatcher(w)
}

export function stopTail(opts: { parentSessionId: string; agentId: string }): void {
  const key = keyFor(opts.parentSessionId, opts.agentId)
  const w = watchers.get(key)
  if (!w) return
  w.closed = true
  if (w.watcher) w.watcher.close()
  if (w.poll) clearInterval(w.poll)
  // Flush any remaining bytes synchronously.
  void readAppended(w).finally(() => {
    watchers.delete(key)
  })
}

export function disposeAll(): void {
  for (const w of watchers.values()) {
    w.closed = true
    if (w.watcher) w.watcher.close()
    if (w.poll) clearInterval(w.poll)
  }
  watchers.clear()
}

let bound = false
export function bindAgentEvents(): void {
  if (bound) return
  bound = true
  agentEvents.on('subagentStart', (ev) => {
    const cwd = ev.cwdHint
    if (!cwd) return
    void startTail({
      parentSessionId: ev.parentSessionId,
      agentId: ev.agentId,
      cwd,
    })
  })
  agentEvents.on('subagentStop', (ev) => {
    stopTail({ parentSessionId: ev.parentSessionId, agentId: ev.agentId })
  })
}
