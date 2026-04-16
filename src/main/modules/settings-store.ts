import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const DATA_DIR = join(homedir(), '.cc-ide')
let SETTINGS_PATH = join(DATA_DIR, 'settings.json')

export function __setDataPathForTests(path: string): void {
  SETTINGS_PATH = path
}

export const editorKeybindsSchema = z.enum(['vscode', 'vim'])
export type EditorKeybinds = z.infer<typeof editorKeybindsSchema>

export const settingsSchema = z.object({
  editor: z
    .object({
      keybinds: editorKeybindsSchema.default('vscode'),
    })
    .default({ keybinds: 'vscode' }),
})
export type Settings = z.infer<typeof settingsSchema>

const settingsFileSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
})

export const defaultSettings: Settings = { editor: { keybinds: 'vscode' } }

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    const parsed = settingsFileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return defaultSettings
    return parsed.data.settings
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings
    return defaultSettings
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await ensureDir()
  const tmp = `${SETTINGS_PATH}.${randomUUID()}.tmp`
  const body = JSON.stringify({ version: 1, settings }, null, 2)
  try {
    await fs.writeFile(tmp, body, 'utf8')
    await fs.rename(tmp, SETTINGS_PATH)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function mergeDeep<T extends Record<string, unknown>>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(patch)) {
    const p = (patch as Record<string, unknown>)[key]
    const b = (base as Record<string, unknown>)[key]
    if (
      p !== undefined &&
      typeof p === 'object' &&
      p !== null &&
      !Array.isArray(p) &&
      typeof b === 'object' &&
      b !== null &&
      !Array.isArray(b)
    ) {
      out[key] = mergeDeep(b as Record<string, unknown>, p as Record<string, unknown>)
    } else if (p !== undefined) {
      out[key] = p
    }
  }
  return out as T
}

export async function updateSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const current = await readSettings()
  const merged = mergeDeep(current, patch)
  const validated = settingsSchema.parse(merged)
  await writeSettings(validated)
  return validated
}
