# Rule · Testing

Vitest. Tests alongside source: `foo.ts` + `foo.test.ts`. Run `pnpm test`; run `pnpm typecheck` separately. The project does NOT couple tests and build — `pnpm build` runs typecheck only.

## Must have tests

The drop-format contract and session discovery parsing are spec-critical. Do not merge changes to these without green tests.

- `src/shared/comment-serializer.ts` — golden drop-strings (`*.test.ts`).
- `src/main/modules/session-discovery.ts` — jsonl parsing against temp-dir fixtures.
- `src/main/modules/worktree-manager.ts` — against real temporary git repos.
- `src/main/modules/diff-provider.ts` — against real temporary git repos with staged/unstaged/rename/untracked.
- `src/main/modules/prompts-store.ts` — atomic writes + corrupt-file recovery.
- `src/main/modules/plan-fs-tree.ts` — CRUD + path safety.

## Fixture pattern

For fs/git tests, always `fs.mkdtemp` in `beforeEach` and `fs.rm --recursive` in `afterEach`. Expose an internal `__setRootForTests(path)` helper on modules whose root is `~/<something>` — tests swap it in, never mock the filesystem.

## UI tests

MVP skips unit tests for React components (too much churn vs value). Use `agent-browser` end-to-end for regression checking (see `references/debug-with-agent-browser.md`). When a bug is fixed in a component, if the underlying logic can be extracted into a pure function, extract it and test the function.

## Before claiming done

- `pnpm typecheck` clean.
- `pnpm test` all green.
- For a serializer change: visually inspect the golden strings you changed and explain in the commit why.
- For a UI change: attach to the live app via `agent-browser connect 9223` and walk the flow (see reference).
