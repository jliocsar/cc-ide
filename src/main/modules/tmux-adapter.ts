import { spawn } from 'node:child_process'

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('tmux', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', () => resolve({ code: -1, stdout, stderr: 'tmux not found' }))
    child.on('exit', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export function sessionNameForWorkspace(workspaceId: string): string {
  return `ccide-${workspaceId.slice(0, 8)}`
}

const IDLE_WINDOW = '__ccide_idle__'

export async function ensureSession(sessionName: string, cwd: string): Promise<void> {
  const has = await run(['has-session', '-t', sessionName])
  if (has.code === 0) return
  const create = await run([
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-n',
    IDLE_WINDOW,
    '-c',
    cwd,
    '-x',
    '200',
    '-y',
    '50',
  ])
  if (create.code !== 0) throw new Error(`tmux new-session failed: ${create.stderr.trim()}`)
}

async function killIdleIfExists(sessionName: string): Promise<void> {
  await run(['kill-window', '-t', `${sessionName}:${IDLE_WINDOW}`])
}

export async function spawnWindow(options: {
  sessionName: string
  windowName: string
  cwd: string
  command: string
}): Promise<string> {
  const { sessionName, windowName, cwd, command } = options
  const r = await run([
    'new-window',
    '-d',
    '-t',
    sessionName,
    '-n',
    windowName,
    '-c',
    cwd,
    command,
  ])
  if (r.code !== 0) throw new Error(`tmux new-window failed: ${r.stderr.trim()}`)
  void killIdleIfExists(sessionName)
  return `${sessionName}:${windowName}`
}

export async function killWindow(target: string): Promise<void> {
  await run(['kill-window', '-t', target])
}

export async function hasWindow(target: string): Promise<boolean> {
  const r = await run(['list-windows', '-F', '#{session_name}:#{window_name}'])
  if (r.code !== 0) return false
  return r.stdout.split('\n').some((line) => line.trim() === target)
}

export async function listWindows(sessionName: string): Promise<string[]> {
  const r = await run(['list-windows', '-t', sessionName, '-F', '#W'])
  if (r.code !== 0) return []
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== IDLE_WINDOW)
}

export async function createViewerSession(options: {
  primarySession: string
  viewerName: string
  windowTarget: string
}): Promise<string> {
  const { primarySession, viewerName, windowTarget } = options
  const create = await run(['new-session', '-d', '-s', viewerName, '-t', primarySession])
  if (create.code !== 0 && !create.stderr.includes('duplicate session')) {
    throw new Error(`tmux new-session (viewer) failed: ${create.stderr.trim()}`)
  }
  const select = await run(['select-window', '-t', `${viewerName}:${windowTarget.split(':')[1]}`])
  if (select.code !== 0) {
    await run(['kill-session', '-t', viewerName])
    throw new Error(`tmux select-window on viewer failed: ${select.stderr.trim()}`)
  }
  return viewerName
}

export async function killViewerSession(viewerName: string): Promise<void> {
  await run(['kill-session', '-t', viewerName])
}

export async function tmuxAvailable(): Promise<boolean> {
  const r = await run(['-V'])
  return r.code === 0
}
