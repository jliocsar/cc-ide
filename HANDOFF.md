# Handoff — start here

Welcome to `cc-ide` mid-flight. The MVP shipped end-to-end across 6 phases; a live-app debug session (Phase 7) caught and fixed four real bugs. Two tasks remain before the project can be declared v0.1:

1. Finish the live-app verification pass — **GitHub issue #2**. That's your first item.
2. Work through the polish backlog — issues #8–#12, in roughly that order.

The future-features issues (#3–#7) are trackers only. Don't start them without talking to JC.

## Read in this order

1. `CLAUDE.md` — the agent entrypoint with links into rules + references.
2. `.claude/rules/*` — non-negotiable patterns. The state-patterns and drop-format rules in particular will save you hours.
3. `.claude/references/phase-summary.md` — what each phase shipped.
4. `.claude/references/lessons.md` — the bugs we already hit. Don't re-introduce them.
5. `.claude/references/architecture.md` — module map.
6. GitHub issue #1 (PRD) and its comments — source of truth for feature scope.

Read everything above before touching code. ~20 minutes total. The time is already in your budget.

## Current state

- `main` branch at latest commit shipping Phase 6 + Phase 7 fixes (dialog forwardRef, command-palette a11y description, prompt editor state reset, zustand EMPTY_RANGES).
- 71 tests across 7 modules, all green. `pnpm typecheck` clean.
- The app runs via `pnpm dev` on port 5173; dev mode exposes CDP on 9223 for `agent-browser`.

## How to resume Phase 7 (issue #2)

1. `pnpm dev` in one terminal.
2. `agent-browser connect 9223` in another.
3. Follow the checklist in issue #2. Install the console-capture hook after every reload (see `.claude/references/debug-with-agent-browser.md`).
4. When a bug surfaces, prefer fixing the root cause over a band-aid. Update `.claude/references/lessons.md` with a new entry.
5. Commit fixes one bug at a time with a message that cites the reproduction path.

## How to work in this project

- Don't add dependencies without asking JC. The set is already covered in `package.json` plus `.claude/rules/dependencies.md`.
- Use `TaskCreate` for anything more than 1–2 steps. Mark done as you go.
- Write code that matches the existing style (see `architecture.md`). New main-side modules go in `src/main/modules/<name>.ts` with an accompanying `*.test.ts`. New IPC goes through `src/shared/ipc.ts` first.
- Never modify the drop format without updating the golden tests in the same commit. The format is the product.
- JC prefers terse communication and hates ceremony. Skip summaries unless they're load-bearing. Don't sign commits as Claude — sign as "JC's clanker".

## If anything is unclear

Ask JC. He'd rather clarify in 30 seconds than have you build the wrong thing. Phrase questions as "I'd do X for reason Y — confirm?" so he can redirect in one word if he disagrees.

## When you finish issue #2

Update `HANDOFF.md` (this file) and `.claude/references/phase-summary.md` with the Phase 7 close-out. Then pick an item from #8–#12 or ask JC which is most valuable next.

Good luck. You've inherited a clean-ish tree.
