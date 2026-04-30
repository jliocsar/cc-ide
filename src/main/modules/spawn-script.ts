import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let rootOverride: string | null = null

export function __setSpawnScriptRootForTests(path: string | null): void {
  rootOverride = path
}

function spawnScriptRoot(): string {
  return rootOverride ?? join(homedir(), '.cc-ide', 'spawn')
}

export type SpawnScriptOptions = {
  windowName: string
  bypassPermissions?: boolean
  initialPromptBase64?: string
  envVars?: Record<string, string>
}

// Escape a value for placement inside a shell double-quoted string. Leaves `$`
// alone (so `$VAR` from the user's rcfile expands at sourcing time), but
// neutralizes `"`, `\`, and backtick which would break the literal.
function escapeDoubleQuoted(value: string): string {
  return value.replace(/[\\"`]/g, (m) => `\\${m}`)
}

// Bash/zsh-compatible env var name.
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildSpawnScript(opts: SpawnScriptOptions): string {
  const lines: string[] = []
  lines.push('# cc-ide spawn script (auto-generated, sourced by user $SHELL)')
  lines.push(`export CC_IDE_WINDOW="${opts.windowName}"`)
  if (opts.envVars) {
    for (const [k, v] of Object.entries(opts.envVars)) {
      if (!ENV_NAME_RE.test(k)) {
        throw new Error(`invalid env var name: ${JSON.stringify(k)}`)
      }
      lines.push(`export ${k}="${escapeDoubleQuoted(v)}"`)
    }
  }
  const args: string[] = ['claude']
  if (opts.bypassPermissions) args.push('--dangerously-skip-permissions')
  if (opts.initialPromptBase64) {
    if (!/^[A-Za-z0-9+/=]+$/.test(opts.initialPromptBase64)) {
      throw new Error('invalid base64 prompt')
    }
    args.push(`"$(printf '%s' '${opts.initialPromptBase64}' | base64 -d)"`)
  }
  lines.push(`exec ${args.join(' ')}`)
  return `${lines.join('\n')}\n`
}

export async function writeSpawnScript(opts: SpawnScriptOptions): Promise<string> {
  const root = spawnScriptRoot()
  await fs.mkdir(root, { recursive: true })
  const safeName = opts.windowName.replace(/[^A-Za-z0-9_-]/g, '_')
  const scriptPath = join(root, `${safeName}.sh`)
  const body = buildSpawnScript(opts)
  await fs.writeFile(scriptPath, body, { mode: 0o600 })
  return scriptPath
}
