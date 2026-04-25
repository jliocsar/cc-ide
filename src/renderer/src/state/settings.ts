import type {
  DiffFontDTO,
  EditorFontDTO,
  EditorKeybindsDTO,
  SettingsDTO,
  TerminalFontDTO,
} from '@shared/ipc'
import { create } from 'zustand'
import { invoke, onEvent } from '@/lib/ipc'

type State = {
  settings: SettingsDTO
  hydrated: boolean
  setEditorKeybinds: (k: EditorKeybindsDTO) => Promise<void>
  setEditorFont: (f: EditorFontDTO) => Promise<void>
  setEditorFontSize: (s: number) => Promise<void>
  setTerminalFont: (f: TerminalFontDTO) => Promise<void>
  setTerminalFallbackFont: (f: string | null) => Promise<void>
  setTerminalFontSize: (s: number) => Promise<void>
  setTerminalLineHeight: (h: number) => Promise<void>
  setDiffFont: (f: DiffFontDTO) => Promise<void>
  setDiffFontSize: (s: number) => Promise<void>
  setDiffWrap: (w: boolean) => Promise<void>
  setDiffStickyGutter: (v: boolean) => Promise<void>
  setWorkspaceDataRoot: (p: string) => Promise<void>
}

export const DEFAULT_DATA_ROOT = '.cc-ide'

const defaultSettings: SettingsDTO = {
  editor: { keybinds: 'vscode', font: 'geist', fontSize: 12 },
  terminal: { font: 'system', fallbackFont: null, fontSize: 13, lineHeight: 1.2 },
  diff: { font: 'geist-mono', fontSize: 12, wrap: true, stickyGutter: true },
  workspace: { dataRoot: DEFAULT_DATA_ROOT },
}

// Mirrors the validation in main/modules/settings-store.ts. Returns an
// error message if the path is invalid, null if OK.
export function validateDataRoot(s: string): string | null {
  if (!s || s.length === 0) return 'folder is required'
  if (s.includes('\0')) return 'must not contain null bytes'
  if (s.startsWith('/') || s.startsWith('\\')) return 'must be a relative path'
  const parts = s.split(/[\\/]/)
  for (const p of parts) {
    if (p === '..') return 'must not contain `..` segments'
    if (p === '') return 'must not contain empty segments'
    if (p.startsWith(' ') || p.endsWith(' '))
      return 'segments must not have leading/trailing spaces'
  }
  return null
}

async function patch(p: Parameters<typeof invoke<'settings:set'>>[1]['patch']) {
  const { settings } = await invoke('settings:set', { patch: p })
  useSettings.setState({ settings })
}

export const useSettings = create<State>(() => ({
  settings: defaultSettings,
  hydrated: false,
  setEditorKeybinds: (k) => patch({ editor: { keybinds: k } }),
  setEditorFont: (f) => patch({ editor: { font: f } }),
  setEditorFontSize: (s) => patch({ editor: { fontSize: s } }),
  setTerminalFont: (f) => patch({ terminal: { font: f } }),
  setTerminalFallbackFont: (f) => patch({ terminal: { fallbackFont: f } }),
  setTerminalFontSize: (s) => patch({ terminal: { fontSize: s } }),
  setTerminalLineHeight: (h) => patch({ terminal: { lineHeight: h } }),
  setDiffFont: (f) => patch({ diff: { font: f } }),
  setDiffFontSize: (s) => patch({ diff: { fontSize: s } }),
  setDiffWrap: (w) => patch({ diff: { wrap: w } }),
  setDiffStickyGutter: (v) => patch({ diff: { stickyGutter: v } }),
  setWorkspaceDataRoot: (p) => patch({ workspace: { dataRoot: p } }),
}))

let bootstrapped = false

export function bootstrapSettings(): void {
  if (bootstrapped) return
  bootstrapped = true
  void invoke('settings:get', {}).then(({ settings }) => {
    useSettings.setState({ settings, hydrated: true })
  })
  onEvent('settings:changed', ({ settings }) => {
    useSettings.setState({ settings })
  })
}
