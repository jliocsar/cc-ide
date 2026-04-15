import { randomUUID } from 'node:crypto'
import * as pty from 'node-pty'
import { broadcast } from './event-bus'

type Entry = { id: string; proc: pty.IPty; onExit?: (code: number | null) => void | Promise<void> }
const ptys = new Map<string, Entry>()

export function openPty(options: {
  command: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  env?: NodeJS.ProcessEnv
  onExit?: (code: number | null) => void | Promise<void>
}): string {
  const id = randomUUID()
  const proc = pty.spawn(options.command, options.args, {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: { ...process.env, ...options.env, TERM: 'xterm-256color' },
  })
  ptys.set(id, { id, proc, onExit: options.onExit })
  proc.onData((data) => broadcast('pty:data', { ptyId: id, data }))
  proc.onExit(({ exitCode }) => {
    const entry = ptys.get(id)
    broadcast('pty:exit', { ptyId: id, exitCode: exitCode ?? null })
    ptys.delete(id)
    void Promise.resolve(entry?.onExit?.(exitCode ?? null)).catch(() => {})
  })
  return id
}

export function writePty(id: string, data: string): void {
  const entry = ptys.get(id)
  if (!entry) return
  entry.proc.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  const entry = ptys.get(id)
  if (!entry) return
  entry.proc.resize(cols, rows)
}

export function closePty(id: string): void {
  const entry = ptys.get(id)
  if (!entry) return
  entry.proc.kill()
  ptys.delete(id)
}
