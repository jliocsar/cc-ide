# Rule · Dependencies

Ask the user before adding any new dependency (runtime or dev). Never silently run `pnpm add`. This rule comes from project CLAUDE.md and has been load-bearing throughout the build.

## Current dependency set

See `package.json` for the authoritative list. Notable choices, in case a future suggestion would duplicate them:

- UI: `react`, `radix-ui`, shadcn-generated components under `src/renderer/src/components/ui/`, `cmdk` (via shadcn command), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Styling: `tailwindcss` v4 + `@tailwindcss/vite`, CSS vars driven from `src/renderer/src/styles/globals.css`.
- State: `zustand`.
- Validation / types: `zod`.
- Terminal: `@xterm/xterm`, `@xterm/addon-fit`, `node-pty` (native, rebuilt via `@electron/rebuild` on `postinstall`).
- Electron + build: `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react`.
- Tests: `vitest`.

## When you need something

1. State what you're trying to do in one sentence.
2. Check if an existing dep can do it.
3. If genuinely new, ask the user with a 1–2 line justification.

## Approving build scripts

`package.json` pins `pnpm.onlyBuiltDependencies` to `electron`, `esbuild`, `node-pty`. Do not expand that list casually — each entry is a native build running on install. New native deps need the user's explicit approval before being added here.
