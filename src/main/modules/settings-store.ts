import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { atomicWriteFile } from './fs-atomic'

const DATA_DIR = join(homedir(), '.cc-ide')
let SETTINGS_PATH = join(DATA_DIR, 'settings.json')

export function __setDataPathForTests(path: string): void {
  SETTINGS_PATH = path
}

export const editorKeybindsSchema = z.enum(['vscode', 'vim'])
export type EditorKeybinds = z.infer<typeof editorKeybindsSchema>

// Font is a free-form family name. Built-in keys (geist, geist-mono,
// space-grotesk) and the legacy 'system' sentinel get special handling at
// resolve time; anything else is treated as a system family from
// queryLocalFonts().
export const fontFamilySchema = z.string().min(1).max(200)
export const fontSizeSchema = z.number().int().min(8).max(32)
export const lineHeightSchema = z.number().min(0.8).max(3)

export const DEFAULT_DATA_ROOT = '.cc-ide'

// Relative path inside each workspace for plans/ and prompts/ subdirs.
// No leading slash, no `..` segments, no NUL bytes, non-empty.
export const dataRootSchema = z
  .string()
  .min(1, 'folder is required')
  .refine((s) => !s.includes('\0'), 'must not contain null bytes')
  .refine((s) => !s.startsWith('/') && !s.startsWith('\\'), 'must be a relative path')
  .refine((s) => {
    const parts = s.split(/[\\/]/)
    return parts.every((p) => p !== '..' && p !== '' && !p.startsWith(' ') && !p.endsWith(' '))
  }, 'must not contain `..` or empty segments')

export const settingsSchema = z.object({
  editor: z
    .object({
      keybinds: editorKeybindsSchema.default('vscode'),
      font: fontFamilySchema.default('geist'),
      fontSize: fontSizeSchema.default(12),
    })
    .default({ keybinds: 'vscode', font: 'geist', fontSize: 12 }),
  terminal: z
    .object({
      font: fontFamilySchema.default('system'),
      fallbackFont: fontFamilySchema.nullable().default(null),
      fontSize: fontSizeSchema.default(13),
      lineHeight: lineHeightSchema.default(1.2),
    })
    .default({ font: 'system', fallbackFont: null, fontSize: 13, lineHeight: 1.2 }),
  diff: z
    .object({
      font: fontFamilySchema.default('geist-mono'),
      fontSize: fontSizeSchema.default(12),
      wrap: z.boolean().default(true),
      stickyGutter: z.boolean().default(true),
    })
    .default({ font: 'geist-mono', fontSize: 12, wrap: true, stickyGutter: true }),
  workspace: z
    .object({
      dataRoot: dataRootSchema.default(DEFAULT_DATA_ROOT),
    })
    .default({ dataRoot: DEFAULT_DATA_ROOT }),
})
export type Settings = z.infer<typeof settingsSchema>

const settingsFileSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
})

export const defaultSettings: Settings = {
  editor: { keybinds: 'vscode', font: 'geist', fontSize: 12 },
  terminal: { font: 'system', fallbackFont: null, fontSize: 13, lineHeight: 1.2 },
  diff: { font: 'geist-mono', fontSize: 12, wrap: true, stickyGutter: true },
  workspace: { dataRoot: DEFAULT_DATA_ROOT },
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    const parsed = settingsFileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      console.error('[settings-store] schema parse failed:', parsed.error.message)
      return defaultSettings
    }
    return parsed.data.settings
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings
    console.error('[settings-store] read failed:', err)
    return defaultSettings
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await ensureDir()
  await atomicWriteFile(SETTINGS_PATH, JSON.stringify({ version: 1, settings }, null, 2))
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
