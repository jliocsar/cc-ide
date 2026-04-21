# Reference · Data paths

## IDE-owned (writable) under `$HOME/.cc-ide/`

| Path | Written by | Purpose |
|---|---|---|
| `workspaces.json` | `workspace-registry.ts` | registry: `{ version: 1, workspaces: Workspace[] }` |
| `prompts.json` | `prompts-store.ts` | global prompt store (cross-project library): `{ version: 1, prompts: Prompt[] }` |
| `canvas/<workspaceId>.json` | `canvas-store.ts` | per-workspace canvas snapshot (camera + windows) |
| `plans/<workspaceId>/**/*.md` | `plan-fs-tree.ts` | **legacy plan location** — auto-migrated on first `plans:tree` call. Don't write here. |
| `hooks/cc-ide-hook.sh` | `claude-hooks-installer.ts` | Claude-hook bridge script. Overwritten on every launch. Invoked by Claude as `bash … session-start\|subagent-start\|subagent-stop`. |
| `tmp/teammate-*.fifo` | `teammate-mirror.ts` | Named pipes used by `tmux pipe-pane` to stream mirrored pane output. Created per teammate attach, best-effort deleted on detach/quit. |

## Workspace-owned (writable) under `<workspace>/.cc-ide/`

| Path | Written by | Purpose |
|---|---|---|
| `<workspace>/.cc-ide/plans/**/*.md` | `plan-fs-tree.ts` | plan tree, user-managed. Users should add `.cc-ide/` to `.gitignore`. |
| `<workspace>/.cc-ide/prompts/**/*.md` | `prompts-fs-tree.ts` | project-scoped prompt tree, user-managed. |

Both are inside the workspace so the drop-format path `.cc-ide/plans/<rel>.md` / `.cc-ide/prompts/<rel>.md` resolves to a real file that Claude can read.

**Plans migration**: `migrateLegacyIfNeeded(workspaceId, workspacePath)` in `plan-fs-tree.ts` moves `~/.cc-ide/plans/<workspaceId>/*` → `<workspace>/.cc-ide/plans/*` on first access. Skips if the destination already has content (legacy is left intact for manual resolution).

All JSON writes are atomic: write `.tmp` → `rename`. All readers tolerate ENOENT and corrupt JSON by returning empty defaults (Zod `safeParse` in the load path).

## Claude-owned (read-only)

| Path | Read by | Purpose |
|---|---|---|
| `~/.claude/projects/<slug>/*.jsonl` | `session-discovery.ts` | Claude's own transcripts per project; source of truth for the Sessions sidebar. Slug derivation: absolute path → replace `/` and `.` with `-`. `/foo/bar` → `-foo-bar`. |
| `~/.claude/projects/<slug>/<sid>/subagents/agent-<aid>.jsonl` | (Phase 2, `subagent-tail.ts`) | Subagent transcripts, tailed live. See `agent-teams.md`. |

## Claude-owned (write, narrowly)

| Path | Written by | Purpose |
|---|---|---|
| `~/.claude/settings.json` | `claude-hooks-installer.ts` | Adds three `cc-ide` hook entries (SessionStart/SubagentStart/SubagentStop). Preserves everything else. Backs up to `.cc-ide-corrupt-<ts>.bkp` if the file is corrupt. See `rules/hooks-integration.md`. |

The IDE never writes here. If Claude's on-disk format changes upstream, the only place to update is `session-discovery.ts`.

## Runtime-only

- `out/` — electron-vite build output, gitignored.
- `node_modules/` — pnpm store.
- `tmp/` — scratch space (gitignored; used by the write-a-prd skill and general agent work).

## Workspace id scheme

Workspaces are identified by a UUID (`crypto.randomUUID()`), not by path. Filesystem children that key by workspace use the UUID directly. This means renaming the on-disk folder doesn't break the registry, but a user-entered display name should still be preserved via `workspaces.json`.
