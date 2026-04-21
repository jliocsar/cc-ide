# cc-ide — agent entry point

Claude Code IDE. Electron + React. Orchestrates multiple Claude Code instances across projects, worktrees, and a spatial canvas with drag-to-terminal plan/diff review.

**Read first, always:** HANDOFF.md (next-agent startup).

## Rules (must follow)

- [.claude/rules/architecture.md](.claude/rules/architecture.md) — main/preload/renderer split, IPC Zod contract, deep modules.
- [.claude/rules/drop-format.md](.claude/rules/drop-format.md) — the load-bearing `@<path>` + `@@ start,len @@` contract.
- [.claude/rules/state-patterns.md](.claude/rules/state-patterns.md) — zustand selector stability (EMPTY_RANGES), persistence debouncing.
- [.claude/rules/testing.md](.claude/rules/testing.md) — what must have tests; fixture pattern.
- [.claude/rules/ui.md](.claude/rules/ui.md) — dark-only monochrome; shadcn rules; reserved shortcuts (Ctrl+K/W/B, Ctrl+0/=/-).
- [.claude/rules/scope.md](.claude/rules/scope.md) — out-of-scope items; do not drift.
- [.claude/rules/dependencies.md](.claude/rules/dependencies.md) — ask before adding any dep.
- [.claude/rules/hooks-integration.md](.claude/rules/hooks-integration.md) — `~/.claude/settings.json` patching + the HTTP hook server on 127.0.0.1:9224.

## References (informational)

- [.claude/references/architecture.md](.claude/references/architecture.md) — full module map with file paths.
- [.claude/references/ipc-channels.md](.claude/references/ipc-channels.md) — channel registry.
- [.claude/references/tmux-model.md](.claude/references/tmux-model.md) — primary session + grouped viewers.
- [.claude/references/canvas-model.md](.claude/references/canvas-model.md) — world transform, pan/zoom math, persistence.
- [.claude/references/data-paths.md](.claude/references/data-paths.md) — `$HOME/.cc-ide/` layout and Claude-owned paths.
- [.claude/references/debug-with-agent-browser.md](.claude/references/debug-with-agent-browser.md) — attach to Electron at `:9223`, flow checklist.
- [.claude/references/agent-teams.md](.claude/references/agent-teams.md) — how subagents and teammates behave on disk and in the process tree.
- [.claude/references/phase-summary.md](.claude/references/phase-summary.md) — what each phase 0–6 shipped.
- [.claude/references/lessons.md](.claude/references/lessons.md) — bugs hit and how we fixed them.

## Commands

- `pnpm dev` — run Electron with dev-only CDP on 9223.
- `pnpm build` — typecheck + build main + preload + renderer (no tests).
- `pnpm test` — Vitest once.
- `pnpm test:watch` — Vitest in watch mode.
- `pnpm typecheck` — `tsc --noEmit` across composite tsconfigs.

## Critical invariants

- The drop format in `src/shared/comment-serializer.ts` is versioned. Golden tests in `comment-serializer.test.ts` lock it.
- `src/shared/ipc.ts` is the ONLY legal boundary between renderer and main. All fs/git/tmux/pty lives in `src/main/`.
- The app is dark mode, monochrome. Colors are reserved for semantic signals.
- Do not add dependencies without asking.

## Task tracking

Use `TaskCreate` for anything more than 1–2 steps. Mark completed as you go. Don't batch.

## Current status (2026-04-14)

MVP shipped end-to-end. Phase 7 live-debug session found and fixed four real bugs (see lessons.md #4–6); a handful of verification flows remain. See open issues in `gh issue list` and HANDOFF.md.
