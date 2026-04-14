## Project

Claude Code IDE — Electron desktop app to orchestrate multiple Claude Code instances across projects, worktrees, and sandboxes. PRD: GitHub issue #1 (`jliocsar/cc-ide`).

## Stack

Electron, React, TanStack Router, TanStack Query, Zustand, React Hook Form, Zod, Tailwind, shadcn + Radix, Vite, Vitest, Lucide, pnpm.

## React skill

Ignore all Next.js instructions in the skill. You're only working with React here.

## Task Tracking

Unless the task takes 1-2 steps, use `TaskCreate` to track your tasks.

## Dependencies

Do not add new libraries or dependencies with consulting me first. Never break this rule.

## Data paths

IDE-owned (writable): `$HOME/.cc-ide/`
- `workspaces.json` — workspace registry
- `prompts.json` — cross-project prompts store
- `canvas/<workspace-slug>.json` — per-workspace canvas state (camera + windows)
- `plans/<workspace-slug>/**/*.md` — plans tree

Claude-owned (read-only): `~/.claude/projects/<slug>/*.jsonl` — source of truth for session discovery.

## Tmux topology

One tmux session per workspace (`has-session -t`, else `new-session -d`). One window per Claude instance. Window cwd = workspace root or selected worktree. Reuse existing sessions on IDE restart — never fragment.

## Architecture rules

- All fs/git/tmux side-effects live in the main process behind a single typed IPC contract (`ipc.ts`) with Zod at the boundary.
- Renderer never touches OS directly — it consumes the typed client.
- Deep modules to keep isolated + testable: `CommentSerializer`, `SessionDiscovery`, `TmuxAdapter`, `ClaudeSessionAdapter`, `WorkspaceRegistry`, `CanvasState`, `PromptsStore`, `PlanFsTree`, `DiffProvider`, `WorktreeManager`.
- Canvas state is per-workspace, serialized, fully restored on workspace switch.

## Drop format contract (load-bearing)

Dragging a plan or diff into a terminal must paste exactly:

```
@<path>
@@ start,len @@
<comment>
@@ start,len @@
<comment>
```

Rules:
- No blank line between `@<path>` and the first `@@`.
- Always emit `@@ start,len @@` (include `len` even when `len == 1`).
- Ranges in ascending `start` order; multi-file diffs ordered by file path.
- Diffs use repo-relative path; plans use `.cc-ide/plans/<path>.md`.

Any change to this format is a versioned breaking change — do not "clean up" the formatting.

## Testing

- Vitest, tests alongside modules (`foo.ts` + `foo.test.ts`).
- **Must test**: `CommentSerializer` (plans + diffs) with golden drop-strings. Contract is spec-critical.
- Before claiming any serializer change works: `pnpm test`.
- Skip tests for UI components, tmux adapter, session discovery at MVP — revisit if bugs appear.

## Scope discipline

Explicitly out of MVP (do NOT drift into these):
- Sandboxing (reserve `sandboxId` field + titlebar slot only — no logic).
- Teammates / connected lines in canvas.
- Workspace file explorer.
- Voice input.
- Multi-monitor / multiple Electron windows.
- Auto-update / telemetry.

## Comment persistence

Plan/diff review comments are in-memory only. Flushed + cleared on drop; discarded on tab close. Do not persist to disk.

## Worktree delete guardrail

Only allow delete when: working tree clean AND HEAD reachable from `origin/<branch>`. Disable button with tooltip otherwise.

## Window close behavior

Closing a canvas window for a live Claude → dialog "Detach or Kill". If the Claude process already exited (pty exit event seen), close silently with no dialog.

