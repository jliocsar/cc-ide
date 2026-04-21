import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { atomicWriteFile } from './fs-atomic'

// Installs cc-ide's Claude hook scripts under `~/.cc-ide/hooks/` and patches
// `~/.claude/settings.json` so Claude invokes them on SessionStart /
// SubagentStart / SubagentStop. Idempotent: existing entries we own (command
// contains `/.cc-ide/hooks/`) are replaced; others are preserved as-is.

let claudeSettingsPath = join(homedir(), '.claude', 'settings.json')
let hooksDir = join(homedir(), '.cc-ide', 'hooks')

export function __setClaudeSettingsPathForTests(p: string): void {
  claudeSettingsPath = p
}
export function __setHooksDirForTests(p: string): void {
  hooksDir = p
}

export function getHooksDir(): string {
  return hooksDir
}
export function getClaudeSettingsPath(): string {
  return claudeSettingsPath
}

const HOOK_EVENTS = ['SessionStart', 'SubagentStart', 'SubagentStop'] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

const ENDPOINT_BY_EVENT: Record<HookEvent, string> = {
  SessionStart: 'session-start',
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
}

const HOOK_SCRIPT_NAME = 'cc-ide-hook.sh'
const OWNERSHIP_MARKER = '/.cc-ide/hooks/'

// One script handles all three events. Claude invokes it as
//   bash <path>/cc-ide-hook.sh <endpoint>
// The hook payload arrives on stdin. The script enriches it with CC_IDE_WINDOW
// + TMUX_PANE/TMUX + /proc cmdline of the invoking Claude, then POSTs to our
// main-process HTTP server. Best-effort: if the IDE isn't running, curl
// fails silently. If jq isn't installed the script splices the JSON by hand.
function hookScriptBody(port: number, host: string): string {
  return `#!/usr/bin/env bash
# cc-ide hook bridge. Installed by the IDE; do not hand-edit.
# Usage: cc-ide-hook.sh <endpoint>   (endpoint = session-start|subagent-start|subagent-stop)
# Payload arrives on stdin as JSON.
set -u
endpoint="\${1:-}"
if [ -z "$endpoint" ]; then exit 0; fi

payload="$(cat || true)"
if [ -z "$payload" ]; then exit 0; fi

cc_ide_window="\${CC_IDE_WINDOW:-}"
tmux_pane="\${TMUX_PANE:-}"
tmux_socket=""
if [ -n "\${TMUX:-}" ]; then
  tmux_socket="\${TMUX%%,*}"
fi

ppid_cmdline=""
if [ -r "/proc/$PPID/cmdline" ]; then
  ppid_cmdline="$(tr '\\0' ' ' < "/proc/$PPID/cmdline" 2>/dev/null || true)"
elif command -v ps >/dev/null 2>&1; then
  ppid_cmdline="$(ps -o command= -p "$PPID" 2>/dev/null || true)"
fi

if command -v jq >/dev/null 2>&1; then
  enriched="$(printf '%s' "$payload" | jq -c \\
    --arg w "$cc_ide_window" \\
    --arg p "$tmux_pane" \\
    --arg s "$tmux_socket" \\
    --arg c "$ppid_cmdline" \\
    '. + {cc_ide_window:$w, tmux_pane:$p, tmux_socket:$s, ppid_cmdline:$c}')"
else
  # Raw-splice fallback: escape backslashes and quotes only. Values here are
  # controlled (window names are validated ASCII; TMUX_PANE is %<digits>;
  # socket is a path; cmdline is process args text).
  esc() { printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; }
  # Strip trailing whitespace/newlines; remove closing brace; append fields.
  trimmed="$(printf '%s' "$payload" | sed -E 's/[[:space:]]+$//')"
  if [ "\${trimmed##*\\}}" = "" ] && [ -n "$trimmed" ]; then
    body="\${trimmed%\\}}"
    enriched="$body,\\"cc_ide_window\\":\\"$(esc "$cc_ide_window")\\",\\"tmux_pane\\":\\"$(esc "$tmux_pane")\\",\\"tmux_socket\\":\\"$(esc "$tmux_socket")\\",\\"ppid_cmdline\\":\\"$(esc "$ppid_cmdline")\\"}"
  else
    enriched="$payload"
  fi
fi

curl -sS -m 2 -X POST \\
  -H 'Content-Type: application/json' \\
  --data-binary "$enriched" \\
  "http://${host}:${port}/$endpoint" >/dev/null 2>&1 || true
`
}

function commandFor(event: HookEvent): string {
  return `bash ${join(hooksDir, HOOK_SCRIPT_NAME)} ${ENDPOINT_BY_EVENT[event]}`
}

type HookEntry = { matcher?: string; hooks?: Array<{ type?: string; command?: string }> }
type ClaudeSettings = {
  hooks?: Partial<Record<string, HookEntry[]>>
  [k: string]: unknown
}

function isOurs(entry: HookEntry): boolean {
  if (!entry?.hooks) return false
  return entry.hooks.some(
    (h) => typeof h?.command === 'string' && h.command.includes(OWNERSHIP_MARKER),
  )
}

async function readClaudeSettings(): Promise<ClaudeSettings> {
  let raw: string
  try {
    raw = await fs.readFile(claudeSettingsPath, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as ClaudeSettings
  } catch {
    // Corrupt JSON — back up so the user can recover, start from empty.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${claudeSettingsPath}.cc-ide-corrupt-${stamp}.bkp`
    try {
      await fs.writeFile(backup, raw)
    } catch (writeErr) {
      console.error('[claude-hooks-installer] could not back up corrupt settings:', writeErr)
    }
    console.error(
      `[claude-hooks-installer] claude settings.json was not valid JSON; backed up to ${backup}`,
    )
    return {}
  }
}

export async function installHookScripts(opts: { port: number; host?: string }): Promise<void> {
  await fs.mkdir(hooksDir, { recursive: true })
  const path = join(hooksDir, HOOK_SCRIPT_NAME)
  const body = hookScriptBody(opts.port, opts.host ?? '127.0.0.1')
  await atomicWriteFile(path, body)
  await fs.chmod(path, 0o755)
}

export async function patchClaudeSettings(): Promise<void> {
  await fs.mkdir(dirname(claudeSettingsPath), { recursive: true })
  const settings = await readClaudeSettings()
  if (!settings.hooks) settings.hooks = {}
  const hooks = settings.hooks
  for (const event of HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as HookEntry[]) : []
    const preserved = existing.filter((e) => !isOurs(e))
    const ourEntry: HookEntry = {
      matcher: '',
      hooks: [{ type: 'command', command: commandFor(event) }],
    }
    hooks[event] = [...preserved, ourEntry]
  }
  await atomicWriteFile(claudeSettingsPath, JSON.stringify(settings, null, 2))
}

export async function ensureClaudeHooksInstalled(opts: {
  port: number
  host?: string
}): Promise<void> {
  await installHookScripts(opts)
  await patchClaudeSettings()
}
