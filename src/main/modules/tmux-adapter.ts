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

export async function ensureSession(sessionName: string, cwd: string): Promise<void> {
  const has = await run(['has-session', '-t', sessionName])
  if (has.code === 0) return
  const create = await run(['new-session', '-d', '-s', sessionName, '-c', cwd, '-x', '200', '-y', '50'])
  if (create.code !== 0) throw new Error(`tmux new-session failed: ${create.stderr.trim()}`)
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
  return `${sessionName}:${windowName}`
}

export async function killWindow(target: string): Promise<void> {
  await run(['kill-window', '-t', target])
}

export async function tmuxAvailable(): Promise<boolean> {
  const r = await run(['-V'])
  return r.code === 0
}
