import { spawn } from 'node:child_process'
import { createReadStream, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { broadcast } from '../event-bus'

// Non-invasively mirrors a tmux pane into a canvas xterm:
//   - `tmux capture-pane -p -J -e` → initial scrollback snapshot (sent via
//     teammate:attach response, not streamed).
//   - `tmux pipe-pane -o 'cat >> <fifo>'` → stream subsequent pane output to
//     a fifo we own. We read the fifo and broadcast bytes on `teammate:data`.
//   - `tmux send-keys -l` → stdin path for typing.
//   - `tmux load-buffer` + `paste-buffer -d` → big-paste path.
//
// The pane lives in the user's tmux server (separate socket from the app's
// primary session). The socket path comes from TMUX_PANE's sibling TMUX env
// (parsed at the first comma in the hook script).

let tmpDirOverride: string | null = null
export function __setTmpDirForTests(p: string | null): void {
  tmpDirOverride = p
}

function tmpDir(): string {
  return tmpDirOverride ?? join(homedir(), '.cc-ide', 'tmp')
}

function runTmux(
  socket: string | undefined,
  args: string[],
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const fullArgs = socket ? ['-S', socket, ...args] : args
    const child = spawn('tmux', fullArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', () => resolve({ code: -1, stdout, stderr: 'tmux not found' }))
    child.on('exit', (code) => resolve({ code: code ?? -1, stdout, stderr }))
    if (stdin !== undefined) {
      child.stdin.write(stdin)
    }
    child.stdin.end()
  })
}

type Mirror = {
  socket: string
  pane: string
  fifoPath: string
  reader: NodeJS.ReadableStream | null
  closed: boolean
}

const mirrors = new Map<string, Mirror>()

function keyFor(socket: string, pane: string): string {
  return `${socket}::${pane}`
}

export function __activeMirrorKeysForTests(): string[] {
  return [...mirrors.keys()]
}

async function mkfifo(path: string): Promise<void> {
  // mkfifo(1) is the portable way; Node has no built-in.
  const r = await new Promise<number>((resolve) => {
    const child = spawn('mkfifo', [path], { stdio: 'ignore' })
    child.on('error', () => resolve(-1))
    child.on('exit', (code) => resolve(code ?? -1))
  })
  if (r !== 0) throw new Error(`mkfifo failed for ${path} (code ${r})`)
}

// Pipe-pane writes to a fifo via `cat >>`. We need to keep the reader end
// open before tmux's `cat` tries to open the fifo for write (otherwise cat
// blocks or errors). We open O_RDWR to avoid the classic fifo deadlock.
async function openFifoReader(path: string): Promise<NodeJS.ReadableStream> {
  // biome-ignore lint/suspicious/noExplicitAny: fs constants missing in node types
  const O_RDWR = (fs as any).constants?.O_RDWR ?? 2
  const fh = await fs.open(path, O_RDWR)
  return createReadStream('', { fd: fh.fd, autoClose: true })
}

export async function getPaneSnapshot(socket: string, pane: string): Promise<string> {
  const r = await runTmux(socket, ['capture-pane', '-p', '-J', '-e', '-t', pane])
  if (r.code !== 0) {
    throw new Error(`tmux capture-pane failed: ${r.stderr.trim() || 'unknown'}`)
  }
  return r.stdout
}

export async function startMirror(opts: { socket: string; pane: string }): Promise<void> {
  const key = keyFor(opts.socket, opts.pane)
  if (mirrors.has(key)) return
  await fs.mkdir(tmpDir(), { recursive: true })
  const fifoPath = join(
    tmpDir(),
    `teammate-${opts.pane.replace(/[^%\w]/g, '_')}-${Date.now()}.fifo`,
  )
  await mkfifo(fifoPath)

  const reader = await openFifoReader(fifoPath)
  const mirror: Mirror = {
    socket: opts.socket,
    pane: opts.pane,
    fifoPath,
    reader,
    closed: false,
  }
  mirrors.set(key, mirror)

  reader.on('data', (chunk: Buffer) => {
    if (mirror.closed) return
    broadcast('teammate:data', {
      socket: mirror.socket,
      pane: mirror.pane,
      data: chunk.toString('utf8'),
    })
  })
  reader.on('end', () => {
    if (mirror.closed) return
    broadcast('teammate:mirrorExit', { socket: mirror.socket, pane: mirror.pane })
    void stopMirror(opts).catch(() => {})
  })

  // `-o` overwrites any prior pipe on this pane (idempotent across restarts).
  // We pipe pane output to `cat >> <fifo>`. When pipe-pane is stopped or the
  // pane dies, cat exits, closing the fifo from the writer side.
  const pipe = await runTmux(opts.socket, [
    'pipe-pane',
    '-o',
    '-t',
    opts.pane,
    `cat >> ${fifoPath}`,
  ])
  if (pipe.code !== 0) {
    await stopMirror(opts).catch(() => {})
    throw new Error(`tmux pipe-pane failed: ${pipe.stderr.trim() || 'unknown'}`)
  }
}

export async function stopMirror(opts: { socket: string; pane: string }): Promise<void> {
  const key = keyFor(opts.socket, opts.pane)
  const m = mirrors.get(key)
  if (!m) return
  m.closed = true
  mirrors.delete(key)
  // Stop piping first so `cat` exits cleanly.
  await runTmux(opts.socket, ['pipe-pane', '-t', opts.pane]).catch(() => {})
  // Destroy the reader (closes the fd).
  try {
    ;(m.reader as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
  } catch {
    // ignore
  }
  await fs.rm(m.fifoPath, { force: true }).catch(() => {})
}

export async function sendKeys(opts: {
  socket: string
  pane: string
  data: string
}): Promise<void> {
  if (opts.data.length === 0) return
  // `-l` = literal. Passes arbitrary bytes without tmux key-table resolution.
  // Pass the data via stdin to avoid ARG_MAX with large writes; but send-keys
  // doesn't read stdin. So we pass as one argv element. tmux handles ~128KB
  // fine in practice; for bigger, callers should use `paste`.
  const r = await runTmux(opts.socket, ['send-keys', '-l', '-t', opts.pane, opts.data])
  if (r.code !== 0) {
    throw new Error(`tmux send-keys failed: ${r.stderr.trim() || 'unknown'}`)
  }
}

const NAMED_KEY_PATTERN =
  /^(Enter|Escape|Space|Tab|BSpace|BTab|Up|Down|Left|Right|Home|End|PageUp|PageDown|IC|DC|C-[\w-]+|M-[\w-]+|S-[\w-]+|F[1-9][0-2]?)$/

export function isNamedTmuxKey(s: string): boolean {
  return NAMED_KEY_PATTERN.test(s)
}

export async function sendSpecialKey(opts: {
  socket: string
  pane: string
  key: string
}): Promise<void> {
  if (!isNamedTmuxKey(opts.key)) {
    throw new Error(`not a valid tmux key name: ${opts.key}`)
  }
  const r = await runTmux(opts.socket, ['send-keys', '-t', opts.pane, opts.key])
  if (r.code !== 0) {
    throw new Error(`tmux send-keys special failed: ${r.stderr.trim() || 'unknown'}`)
  }
}

export async function pasteBuffer(opts: {
  socket: string
  pane: string
  data: string
}): Promise<void> {
  if (opts.data.length === 0) return
  const load = await runTmux(opts.socket, ['load-buffer', '-'], opts.data)
  if (load.code !== 0) {
    throw new Error(`tmux load-buffer failed: ${load.stderr.trim() || 'unknown'}`)
  }
  const paste = await runTmux(opts.socket, ['paste-buffer', '-d', '-t', opts.pane])
  if (paste.code !== 0) {
    throw new Error(`tmux paste-buffer failed: ${paste.stderr.trim() || 'unknown'}`)
  }
}

export function disposeAll(): void {
  for (const m of mirrors.values()) {
    m.closed = true
    try {
      ;(m.reader as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
    } catch {
      // ignore
    }
    // Best-effort: stop pipe and remove fifo without awaiting.
    void runTmux(m.socket, ['pipe-pane', '-t', m.pane]).catch(() => {})
    void fs.rm(m.fifoPath, { force: true }).catch(() => {})
  }
  mirrors.clear()
}
