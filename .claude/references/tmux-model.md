# Reference · Tmux model

## Topology

- **Primary session per workspace.** Name: `ccide-<first 8 of workspaceId>`. Ensured once on first Claude spawn via `has-session -t` → `new-session -d` fallback.
- **One window per Claude instance** inside the primary session. Window name: `claude-<timestamp>` for fresh spawns, `claude-r-<prefix>` for resumes.
- **One grouped viewer session per canvas window.** Name: `<primarySession>-v-<8 hex>`. Created via `tmux new-session -d -s <viewer> -t <primary>` — `-t` groups the viewer with the primary so they share the window set.
- Each viewer session has **its own selected window**, so multiple canvas windows can show different tmux windows without focus-stealing. This is the reason grouped sessions exist; a plain `attach-session -t primary` would share focus.

## Pty attach

For every canvas window that renders a live terminal, `src/main/modules/pty-manager.ts` spawns `tmux attach-session -t <viewerSession>` under `node-pty`. The viewer's selected window (set at creation time via `select-window -t <viewer>:<windowName>`) determines what the user sees.

## Lifecycle

- **Spawn**: `src/main/ipc.ts::session:spawnClaude` — ensure primary → `new-window` → `createViewerSession` → `openPty` with `onExit` hook that kills the viewer session.
- **Resume**: same flow but the window command is `claude --resume <sessionId>`.
- **Rehydrate on workspace switch**: `session:attachExisting` checks if the target window still exists in tmux (`hasWindow`); if yes, spawns a new viewer + pty without creating a new claude window.
- **Detach (user clicks × → Detach)**: `pty:close` kills the viewer pty; `onExit` fires; viewer session is cleaned up; claude window and process stay alive.
- **Kill (user clicks × → Kill)**: renderer first calls `session:killTmuxWindow` to kill the claude window, then `pty:close` for the viewer.
- **Pty exit (claude ran /exit, crashed, or was killed externally)**: `pty:exit` event fires; sessions store marks `exited: true`; close dialog is skipped when the user then clicks ×.

## Dependencies

The app requires `tmux` on `PATH`. `tmuxAvailable()` probes via `tmux -V` and every spawn surfaces a clear error if missing. Do not bundle tmux; it is a system dependency.

## Primary session isn't killed

Closing every viewer leaves the primary session alive in tmux. This is intentional — it means existing claude windows persist across IDE restarts. The IDE never issues `tmux kill-session -t <primary>`. Kill it from a terminal with `tmux kill-session -t ccide-<id>` if you want to reset.
