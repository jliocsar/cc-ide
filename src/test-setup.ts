import { vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))
