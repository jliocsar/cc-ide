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
  if (has.code !== 0) {
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
  // Idempotent: re-applied even on re-attach so upgrades pick up without
  // killing the tmux server. set-clipboard on → tmux emits OSC 52 on
  // copy-mode yank (xterm-view handler writes to system clipboard).
  await run(['set-option', '-s', 'set-clipboard', 'on'])
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
  const r = await run(['new-window', '-d', '-t', sessionName, '-n', windowName, '-c', cwd, command])
  if (r.code !== 0) throw new Error(`tmux new-window failed: ${r.stderr.trim()}`)
  void killIdleIfExists(sessionName)
  return `${sessionName}:${windowName}`
}

export async function killWindow(target: string): Promise<void> {
  await run(['kill-window', '-t', target])
}

export async function renameWindow(
  sessionName: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const r = await run(['rename-window', '-t', `${sessionName}:${oldName}`, newName])
  if (r.code !== 0) throw new Error(`tmux rename-window failed: ${r.stderr.trim()}`)
}

export async function hasWindow(target: string): Promise<boolean> {
  const r = await run(['list-windows', '-a', '-F', '#{session_name}:#{window_name}'])
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
  const { viewerName, windowTarget } = options
  // Create a standalone viewer session with a placeholder window. Then link
  // ONLY the target window into the viewer at index 0 (-k kills the
  // placeholder so the link succeeds at that exact slot).
  //
  // Why not `new-session -t primary` (linked group)? Linked groups share ALL
  // windows. When the target window dies, the viewer auto-switches to a
  // sibling — leaving the canvas window pointed at some OTHER live Claude.
  // Standalone session + single linked window means: target dies → viewer
  // has 0 windows → viewer session dies → pty exits → canvas window closes.
  const create = await run(['new-session', '-d', '-s', viewerName, '-n', '__viewer_init__'])
  if (create.code !== 0) {
    throw new Error(`tmux new-session (viewer) failed: ${create.stderr.trim()}`)
  }
  const link = await run(['link-window', '-k', '-s', windowTarget, '-t', `${viewerName}:0`])
  if (link.code !== 0) {
    await run(['kill-session', '-t', viewerName])
    throw new Error(`tmux link-window on viewer failed: ${link.stderr.trim()}`)
  }
  return viewerName
}

export async function killViewerSession(viewerName: string): Promise<void> {
  await run(['kill-session', '-t', viewerName])
}

// Per-session hardening for canvas viewers. Applied after createViewerSession.
// - status off: no tmux tab bar / status line — the canvas window is the chrome.
// - prefix None + prefix2 None: every tmux key binding is disabled inside the
//   viewer pty. User can't create windows (prefix+c), split panes (prefix+%/"),
//   detach (prefix+d), or anything else. The viewer becomes a "raw terminal"
//   pointed at the running claude. The user's global ~/.tmux.conf is not
//   touched — these are session-scoped options on the user's existing server.
export async function hardenViewerSession(viewerName: string): Promise<void> {
  await Promise.all([
    run(['set-option', '-t', viewerName, 'status', 'off']),
    run(['set-option', '-t', viewerName, 'prefix', 'None']),
    run(['set-option', '-t', viewerName, 'prefix2', 'None']),
  ])
}

export async function tmuxAvailable(): Promise<boolean> {
  const r = await run(['-V'])
  return r.code === 0
}
