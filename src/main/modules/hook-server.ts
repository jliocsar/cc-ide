import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import * as agentMap from './agent-map'

export const HOOK_HOST = '127.0.0.1'
export const HOOK_PORT = 9224

const sessionStartSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  hook_event_name: z.string().optional(),
  source: z.string().optional(),
  model: z.string().optional(),
  agent_type: z.string().optional(),
  cc_ide_window: z.string().optional(),
  tmux_pane: z.string().optional(),
  tmux_socket: z.string().optional(),
  ppid_cmdline: z.string().optional(),
})

const subagentStartSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  agent_id: z.string(),
  agent_type: z.string().optional(),
  teammate_name: z.string().nullable().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string().optional(),
  cc_ide_window: z.string().optional(),
  ppid_cmdline: z.string().optional(),
})

const subagentStopSchema = subagentStartSchema.extend({
  agent_transcript_path: z.string().optional(),
  last_assistant_message: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
})

type State = { server: http.Server | null; port: number | null }
const state: State = { server: null, port: null }

async function readBody(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) {
        req.destroy()
        reject(new Error('body too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function respond(res: http.ServerResponse, code: number, body?: string): void {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(body ?? JSON.stringify({ ok: code < 400 }))
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST') return respond(res, 405)
  let raw: string
  try {
    raw = await readBody(req)
  } catch {
    return respond(res, 413)
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return respond(res, 400, JSON.stringify({ error: 'invalid json' }))
  }
  try {
    switch (req.url) {
      case '/session-start': {
        const parsed = sessionStartSchema.safeParse(json)
        if (!parsed.success)
          return respond(res, 400, JSON.stringify({ error: parsed.error.message }))
        agentMap.onSessionStart(parsed.data)
        return respond(res, 200)
      }
      case '/subagent-start': {
        const parsed = subagentStartSchema.safeParse(json)
        if (!parsed.success)
          return respond(res, 400, JSON.stringify({ error: parsed.error.message }))
        agentMap.onSubagentStart(parsed.data)
        return respond(res, 200)
      }
      case '/subagent-stop': {
        const parsed = subagentStopSchema.safeParse(json)
        if (!parsed.success)
          return respond(res, 400, JSON.stringify({ error: parsed.error.message }))
        agentMap.onSubagentStop(parsed.data)
        return respond(res, 200)
      }
      default:
        return respond(res, 404)
    }
  } catch (err) {
    console.error('[hook-server] handler error:', err)
    return respond(res, 500)
  }
}

export async function startHookServer(
  opts: { port?: number; host?: string } = {},
): Promise<number> {
  if (state.server && state.port != null) return state.port
  const host = opts.host ?? HOOK_HOST
  const port = opts.port ?? HOOK_PORT
  const server = http.createServer((req, res) => {
    void handle(req, res)
  })
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
  state.server = server
  state.port = (server.address() as AddressInfo).port
  return state.port
}

export async function stopHookServer(): Promise<void> {
  const s = state.server
  state.server = null
  state.port = null
  if (!s) return
  await new Promise<void>((resolve) => s.close(() => resolve()))
}

export function getHookServerPort(): number | null {
  return state.port
}
