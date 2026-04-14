# Reference · Data paths

## IDE-owned (writable) under `$HOME/.cc-ide/`

| Path | Written by | Purpose |
|---|---|---|
| `workspaces.json` | `workspace-registry.ts` | registry: `{ version: 1, workspaces: Workspace[] }` |
| `prompts.json` | `prompts-store.ts` | cross-project prompts library: `{ version: 1, prompts: Prompt[] }` |
| `canvas/<workspaceId>.json` | `canvas-store.ts` | per-workspace canvas snapshot (camera + windows) |
| `plans/<workspaceId>/**/*.md` | `plan-fs-tree.ts` | plan tree, user-managed |

All JSON writes are atomic: write `.tmp` → `rename`. All readers tolerate ENOENT and corrupt JSON by returning empty defaults (Zod `safeParse` in the load path).

## Claude-owned (read-only)

| Path | Read by | Purpose |
|---|---|---|
| `~/.claude/projects/<slug>/*.jsonl` | `session-discovery.ts` | Claude's own transcripts per project; source of truth for the Sessions sidebar. Slug derivation: absolute path → replace `/` and `.` with `-`. `/foo/bar` → `-foo-bar`. |

The IDE never writes here. If Claude's on-disk format changes upstream, the only place to update is `session-discovery.ts`.

## Runtime-only

- `out/` — electron-vite build output, gitignored.
- `node_modules/` — pnpm store.
- `tmp/` — scratch space (gitignored; used by the write-a-prd skill and general agent work).

## Workspace id scheme

Workspaces are identified by a UUID (`crypto.randomUUID()`), not by path. Filesystem children that key by workspace use the UUID directly. This means renaming the on-disk folder doesn't break the registry, but a user-entered display name should still be preserved via `workspaces.json`.
