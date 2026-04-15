import { create } from 'zustand'
import { invoke, onEvent } from '@/lib/ipc'
import type { SettingsDTO, EditorKeybindsDTO } from '@shared/ipc'

type State = {
  settings: SettingsDTO
  hydrated: boolean
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  setEditorKeybinds: (k: EditorKeybindsDTO) => Promise<void>
}

const defaultSettings: SettingsDTO = { editor: { keybinds: 'vscode' } }

export const useSettings = create<State>((set) => ({
  settings: defaultSettings,
  hydrated: false,
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setEditorKeybinds: async (k) => {
    const { settings } = await invoke('settings:set', {
      patch: { editor: { keybinds: k } },
    })
    set({ settings })
  },
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
