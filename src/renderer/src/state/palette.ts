import { create } from 'zustand'

type State = {
  paletteOpen: boolean
  promptsOpen: boolean
  setPalette: (v: boolean) => void
  setPrompts: (v: boolean) => void
  togglePalette: () => void
}

export const usePalette = create<State>((set) => ({
  paletteOpen: false,
  promptsOpen: false,
  setPalette: (v) => set({ paletteOpen: v }),
  setPrompts: (v) => set({ promptsOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
}))
