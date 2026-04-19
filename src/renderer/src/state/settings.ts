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
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  setEditorKeybinds: (k: EditorKeybindsDTO) => Promise<void>
  setEditorFont: (f: EditorFontDTO) => Promise<void>
  setEditorFontSize: (s: number) => Promise<void>
  setTerminalFont: (f: TerminalFontDTO) => Promise<void>
  setTerminalFontSize: (s: number) => Promise<void>
  setDiffFont: (f: DiffFontDTO) => Promise<void>
  setDiffFontSize: (s: number) => Promise<void>
  setDiffWrap: (w: boolean) => Promise<void>
  setDiffStickyGutter: (v: boolean) => Promise<void>
}

const defaultSettings: SettingsDTO = {
  editor: { keybinds: 'vscode', font: 'geist', fontSize: 12 },
  terminal: { font: 'system', fontSize: 13 },
  diff: { font: 'geist-mono', fontSize: 12, wrap: true, stickyGutter: true },
}

async function patch(p: Parameters<typeof invoke<'settings:set'>>[1]['patch']) {
  const { settings } = await invoke('settings:set', { patch: p })
  useSettings.setState({ settings })
}

export const useSettings = create<State>((set) => ({
  settings: defaultSettings,
  hydrated: false,
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setEditorKeybinds: (k) => patch({ editor: { keybinds: k } }),
  setEditorFont: (f) => patch({ editor: { font: f } }),
  setEditorFontSize: (s) => patch({ editor: { fontSize: s } }),
  setTerminalFont: (f) => patch({ terminal: { font: f } }),
  setTerminalFontSize: (s) => patch({ terminal: { fontSize: s } }),
  setDiffFont: (f) => patch({ diff: { font: f } }),
  setDiffFontSize: (s) => patch({ diff: { fontSize: s } }),
  setDiffWrap: (w) => patch({ diff: { wrap: w } }),
  setDiffStickyGutter: (v) => patch({ diff: { stickyGutter: v } }),
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
