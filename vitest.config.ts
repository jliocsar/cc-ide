import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/renderer/**/*',
        'src/preload/**/*',
        'src/main/index.ts',
        'src/main/ipc.ts',
        'src/main/event-bus.ts',
        'src/main/modules/pty-manager.ts',
        'src/test-setup.ts',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'out',
        '.cc-ide',
        'tmp',
        'prompts',
        'coverage',
        '.claude',
        '.agents',
        '.biome-plugins',
      ],
    },
  },
})
