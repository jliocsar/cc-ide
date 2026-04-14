import { create } from 'zustand'

type State = {
  ptyId: string | null
  setLast: (ptyId: string | null) => void
}

export const useLastTerminal = create<State>((set) => ({
  ptyId: null,
  setLast: (ptyId) => set({ ptyId }),
}))
