# Rule · Architecture boundaries

The project is an Electron app with three processes: main, preload, renderer. Cross this boundary only through the typed IPC contract.

## Must

- All fs, git, tmux, and child-process side effects live in `src/main/`. The renderer must never require Node built-ins or shell out.
- Every IPC channel is declared in `src/shared/ipc.ts` with a Zod `request` + `response` schema. Do not `ipcMain.handle` a channel that is not in `ipcContract`.
- The renderer uses `window.ccIde.invoke(channel, payload)` via the thin wrapper at `src/renderer/src/lib/ipc.ts`. Event subscriptions use `onEvent(channel, listener)`.
- Preload is a types-only bridge. It must stay small (the built preload is ~0.4 KB). Never import runtime code from `@shared/ipc` into preload — type-only imports only.
- Deep modules in `src/main/modules/` are pure-ish and testable. They take plain inputs (paths, ids) and return plain data. They do not know about Electron, IPC, or the renderer.

## Must not

- Do not add a new IPC handler without also adding its request+response schemas to `ipcContract`.
- Do not couple a main-process module to Electron APIs (BrowserWindow, dialog) — that stays in `src/main/ipc.ts` or `src/main/index.ts`.
- Do not import `src/main/*` from the renderer (Vite alias config will reject it anyway).

## When adding a new capability

1. Add the Zod schemas + channel name to `src/shared/ipc.ts`.
2. Write the deep module in `src/main/modules/<name>.ts` with its own tests alongside.
3. Register the handler in `src/main/ipc.ts` as a thin call-through that validates I/O via the shared wrapper.
4. Consume in the renderer via `invoke('name:...', payload)`.

See `references/architecture.md` for the current module map and `references/ipc-channels.md` for the full channel list.
