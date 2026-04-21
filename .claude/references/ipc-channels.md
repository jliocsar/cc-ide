# Reference · IPC channel registry

Authoritative contract: `src/shared/ipc.ts`. Handler wiring: `src/main/ipc.ts`. Renderer entry: `src/renderer/src/lib/ipc.ts` (`invoke`, `onEvent`).

All request/response channels use Zod schemas on both sides of the boundary. Zod validates both the incoming request in main and the outgoing response to the renderer. Event channels have schemas in `eventChannels`.

## Request/response channels

| Channel | Purpose |
|---|---|
| `app:ping` | Proof-of-life; roundtrip timing. |
| `workspace:list` | Read workspaces from `~/.cc-ide/workspaces.json`. |
| `workspace:pickAndAdd` | Native folder picker → git validation → persist. |
| `workspace:remove` | Remove from registry (disk untouched). |
| `session:spawnClaude` | Spawn `claude` in a new tmux window + grouped viewer + attach pty. |
| `session:resumeClaude` | Spawn `claude --resume <sessionId>` in a new tmux window + viewer + pty. |
| `session:killTmuxWindow` | Kill a specific `sess:window` target. Used by close-dialog "Kill". |
| `session:attachExisting` | Rehydrate a dormant canvas window: make a fresh viewer grouped session + pty for an existing tmux window. |
| `pty:write` | Write string to pty stdin. |
| `pty:resize` | Resize pty. |
| `pty:close` | Kill the pty (viewer session cleanup runs via `onExit`). |
| `canvas:load` | Read per-workspace canvas state. |
| `canvas:save` | Write per-workspace canvas state (atomic tmp+rename). |
| `sessions:list` | Discover `.jsonl` transcripts under `~/.claude/projects/<slug>/`. |
| `worktrees:list` | `git worktree list --porcelain` parsed. |
| `worktrees:create` | `git worktree add` with optional base branch. |
| `worktrees:delete` | `git worktree remove` (no --force). |
| `worktrees:canDelete` | Guard: dirty / unpushed / no-tracking / primary; returns all applicable reasons. |
| `diffs:list` | Staged + unstaged + untracked changed files per worktree. |
| `diffs:get` | Full FileDiff with hunks for a single (path, stage). |
| `prompts:list` | With `query` + `sort` options. |
| `prompts:create` / `prompts:update` / `prompts:delete` | CRUD. |
| `plans:tree` | Recursive `PlanDir` rooted at the workspace's plans dir. |
| `plans:read` / `plans:write` / `plans:create` / `plans:createFolder` / `plans:rename` / `plans:delete` | File ops with path-safety guard. |

## Event channels (main → renderer)

| Channel | Payload |
|---|---|
| `pty:data` | `{ ptyId, data: string }` — streams UTF-8 chunks from the pty. |
| `pty:exit` | `{ ptyId, exitCode: number \| null }` — fires once per pty; pty is removed from the manager after. |
| `agent:teammateStart` | Resolved teammate spawn (parent+team+color+tmux pane). Fired by `hook-server.ts` → `agent-map.ts`. See `agent-teams.md`. |
| `agent:subagentStart` | Resolved subagent spawn (parent session + agent id/type). |
| `agent:subagentStop` | Subagent finished; carries `agent_transcript_path` + `last_assistant_message`. |
| `agent:subagentTranscriptLine` | `{ parentSessionId, agentId, entries: TranscriptEntry[] }` — live transcript appends from `subagent-tail.ts`. Entries are parsed jsonl rows: `assistant-text`, `tool-use`, `tool-result`, `user-text`. |

Broadcast implementation: `src/main/modules/pty-manager.ts::broadcast` iterates `BrowserWindow.getAllWindows()`.

## Adding a new channel

See `../rules/architecture.md`. Order matters: add the schema first, write the module and its tests, then register the handler. Do not `ipcMain.handle` a channel that isn't in `ipcContract` — the generic handler wrapper in `src/main/ipc.ts` explicitly rejects unknown channels via its type system.
