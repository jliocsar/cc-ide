# Handoff — start here

Welcome to `cc-ide` mid-flight. The MVP shipped end-to-end across 6 phases; the Phase 7 live-debug session is now closed out — all flows in issue #2 are verified and seven real bugs have been fixed (see `.claude/references/lessons.md` items 4–6, 11–12 and the diffs/worktree EMPTY_FILES entry). One task remains before the project can be declared v0.1:

1. Work through the polish backlog — issues #8–#12, in roughly that order.

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

- `main` branch at Phase 7 close-out. Recent fixes: `EMPTY_FILES` for diffs selector, `AlertDialog` forwardRef wrappers, global `pty:exit` listener in Shell.
- 71 tests across 7 modules, all green. `pnpm typecheck` clean.
- The app runs via `pnpm dev` on port 5173; dev mode exposes CDP on 9223 for `agent-browser`.

## How to work in this project

- Don't add dependencies without asking JC. The set is already covered in `package.json` plus `.claude/rules/dependencies.md`.
- Use `TaskCreate` for anything more than 1–2 steps. Mark done as you go.
- Write code that matches the existing style (see `architecture.md`). New main-side modules go in `src/main/modules/<name>.ts` with an accompanying `*.test.ts`. New IPC goes through `src/shared/ipc.ts` first.
- Never modify the drop format without updating the golden tests in the same commit. The format is the product.
- JC prefers terse communication and hates ceremony. Skip summaries unless they're load-bearing. Don't sign commits as Claude — sign as "JC's clanker".

## If anything is unclear

Ask JC. He'd rather clarify in 30 seconds than have you build the wrong thing. Phrase questions as "I'd do X for reason Y — confirm?" so he can redirect in one word if he disagrees.

## Next up

Pick an item from #8–#12 or ask JC which is most valuable next.

Good luck. You've inherited a clean-ish tree.
