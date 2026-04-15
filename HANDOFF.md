# Handoff — start here

Welcome to `cc-ide`. The MVP shipped across 6 phases; Phase 7 closed out live-debug bugs; a Phase 8 polish pass shipped the remaining backlog (#8–#12) plus a round of UX asks from JC (per-workspace tabs, cat-name session IDs, right-click spawn, session exit auto-close, sidebar layout fixes, diff scroll, fs.watch auto-refresh). **v0.1 ready.**

No open work items other than the future-features trackers (#3–#7). Don't start those without talking to JC.

## Read in this order

1. `CLAUDE.md` — the agent entrypoint with links into rules + references.
2. `.claude/rules/*` — non-negotiable patterns. The state-patterns and drop-format rules in particular will save you hours.
3. `.claude/references/phase-summary.md` — what each phase shipped.
4. `.claude/references/lessons.md` — the bugs we already hit. Don't re-introduce them.
5. `.claude/references/architecture.md` — module map.
6. GitHub issue #1 (PRD) and its comments — source of truth for feature scope.

Read everything above before touching code. ~20 minutes total.

## Current state

- `main` branch at Phase 8 close-out.
- 81 tests across 9 modules, all green. `pnpm typecheck` clean.
- `pnpm dev` on port 5173; CDP on 9223 for `agent-browser` (gated by `CC_IDE_DEVTOOLS=1` — no more auto-detached devtools).

## What Phase 8 added

- **Per-workspace tabs** (`src/main/modules/tabs-store.ts`, `src/renderer/src/hooks/use-tabs-persistence.ts`). Tabs now live under `~/.cc-ide/tabs/<workspaceId>.json`; switching workspaces stashes and swaps tab state. Mirrors the canvas-persistence pattern — if you modify it, read both hooks side-by-side.
- **Cat-name session naming** (`src/main/modules/cat-name-gen.ts`). Tmux windows are `claude-<slug>` (e.g., `claude-oreo`), unique within the primary session via `tmux list-windows`. Dep: `cat-names` (ESM-only, dynamic imported). The primary tmux session now starts with a `__ccide_idle__` placeholder window that gets killed after the first real claude window spawns — this avoids the old zsh+claude double-window problem.
- **Session exit auto-close**: Shell's `pty:exit` listener removes any canvas windows with that `sessionId`. `/exit` or Ctrl+C in a Claude session closes the canvas window.
- **New-session entry points**: "+" in the Sessions accordion header, and right-click → "New session" on the canvas (spawns at the click position in world coords). Both route through `useSpawnSession` (`src/renderer/src/hooks/use-spawn-session.ts`).
- **Sidebar restructure**: `SectionHeader` renders count + actions inline in the accordion row, darker `bg-muted/40`, full-row hover. Sections (`sessions`, `worktrees`, `plans`, `diffs`) stripped their duplicate toolbars. Diffs branch is a pill, `clean` text dropped.
- **fs.watch auto-refresh** (`src/main/modules/watchers.ts` + `event-bus.ts`). Sessions (`~/.claude/projects/<slug>`), worktrees (`<repo>/.git/worktrees`), plans (`~/.cc-ide/plans/<id>`) all fire `*:changed` events on external writes; sidebar re-fetches. Debounced 300ms per (workspace, kind). Watchers install lazily on first list IPC; disposed on `before-quit`.
- **Tab drag reorder** in header via HTML5 DnD (`application/x-cc-ide-tab-reorder` MIME). Board stays pinned.
- **Polish fixes**:
  - Plans rename validates sibling collision + strips `/` before IPC.
  - Resume-session placement uses viewport center, not camera top-left.
  - Devtools auto-open gated behind `CC_IDE_DEVTOOLS=1`.
  - Window titlebar drag bails when target is inside a `<button>` — fixes X-to-close on dormant windows.
  - DiffViewer grid uses `grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)]` so the hunks ScrollArea actually has bounded height.
  - Sidebar ScrollArea needs `min-h-0` on the `flex-1` root + arbitrary-selector overrides on Radix's internal `display:table` wrapper — otherwise content widens beyond 260px and vertical scroll doesn't engage.

## How to work in this project

- Don't add dependencies without asking JC. The set is covered in `package.json` plus `.claude/rules/dependencies.md`.
- Use `TaskCreate` for anything more than 1–2 steps. Mark done as you go.
- Write code that matches existing style (see `architecture.md`). New main-side modules go in `src/main/modules/<name>.ts` with an accompanying `*.test.ts`. New IPC goes through `src/shared/ipc.ts` first.
- Never modify the drop format without updating the golden tests in the same commit. The format is the product.
- **Don't delegate subagents to isolated worktrees** — during Phase 8 three worker agents hit an empty worktree (no `src/` seeded) and bailed. Delegate without `isolation: "worktree"` or populate the worktree first.
- JC prefers terse communication and hates ceremony. Skip summaries unless they're load-bearing. Don't sign commits as Claude — sign as "JC's clanker".

## If anything is unclear

Ask JC. He'd rather clarify in 30 seconds than have you build the wrong thing. Phrase questions as "I'd do X for reason Y — confirm?" so he can redirect in one word if he disagrees.

## Next up

Nothing on the critical path. Possible next moves, pick with JC:
- Close the open polish issues on GitHub (they're fixed in code — needs a PR + issue close).
- Start a future-features spike (#3–#7) — sandboxing, teammates, voice, etc. All require PRD alignment first.
- Quality pass: bump test coverage on the new watchers + tabs-store + cat-name-gen modules (81 tests is healthy but watchers have no integration test).

Good luck. Clean tree.
