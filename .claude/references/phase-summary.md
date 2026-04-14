# Reference · What each phase shipped

For the original plan and any deltas, see GitHub issue #1 and its comments. Commit history in `git log --oneline` is the ground truth.

## Phase 0 — scaffolding

- electron-vite template, TS strict across three tsconfigs (node / web / root paths).
- shadcn (new-york, neutral) + Tailwind v4, dark-only via `<html class="dark">`.
- Static shell: Sidebar | Header tabs / Canvas / Statusbar.
- Typed IPC with Zod (`app:ping` proof-of-life).
- Vitest + one sanity test.

## Phase 1 — tracer bullet

Minimum end-to-end path: add workspace (folder picker + git check) → spawn Claude in tmux → xterm.js renders the live pty → typeable.

Modules introduced: `workspace-registry`, `tmux-adapter`, `pty-manager`, IPC bridge with event subscriptions. Native build wired via `@electron/rebuild` postinstall for node-pty.

## Phase 2 — spatial canvas

- Viewport + world transform; pan/zoom/drag/resize.
- Per-workspace canvas persistence (`canvas:load`/`canvas:save`, debounced).
- Close-window dialog (Detach/Kill, skips if pty already exited).
- Grouped viewer sessions per canvas window for multi-window isolation.
- Rehydration on workspace switch via `session:attachExisting`.

Post-Phase-2 fix: the viewport-pan handler captured pointerup on every pointerdown, breaking child button clicks. Fixed by only panning when `ev.target === viewportRoot`.

## Phase 3 — deep modules fan-out

Five modules landed in parallel by sub-agents, each with tests:

- `CommentSerializer` (shared) — 11 golden tests locking the drop format.
- `SessionDiscovery` (main) — 13 tests; defensive jsonl parser.
- `WorktreeManager` (main) — 9 tests; git CRUD + delete guardrail.
- `DiffProvider` (main) — 9 tests; staged/unstaged + hunk parser.
- `PromptsStore` (main) — 10 tests; atomic JSON with search/sort/favorites.

## Phase 3.wire — sidebar + IPC

- IPC extended with 11 new channels fronting the modules.
- Sidebar became a shadcn Accordion: Workspaces / Sessions / Worktrees / Plans (stubbed) / Diffs.
- Sessions list with first-user-message previews; Worktrees with create dialog + guarded delete; Diffs per-worktree file lists.

## Phase 4.a–4.c — plan tree & tabs

- `plan-fs-tree` module + 18 tests (written inline after an agent permission issue).
- Tabs store (`state/tabs.ts`): Board pinned + dynamic plan/diff/prompt tabs.
- TabRouter routes activeTab.kind to Canvas or the appropriate viewer.
- Plans sidebar: file-explorer tree with CRUD (new file/folder, rename, delete, move via rename).
- Ctrl+W closes active non-pinned tab.

## Phase 4.d–4.e — plan review UX

- Real PlanViewer: line-numbered render with click/shift/ctrl-click range selection; per-range comment textarea + Cancel.
- In-memory `useReviewComments` store keyed by `planTabId()` / `diffTabId()`.
- Sidebar shows comment-count badge per plan row.
- Drag-to-terminal: plan tabs + sidebar rows set `application/x-cc-ide-drop` MIME; XtermWindow is the drop target; drop builds the string via CommentSerializer, pastes via `pty:write`, clears the source tab's comments.

## Phase 4.f — diff review UX

- Side-by-side hunks with old/new columns, green add / red remove tints.
- Line selection on the NEW side only (lines with `newLineNo`).
- Same comments/drag model as PlanViewer; same drop format contract.

## Phase 5 — palette, prompts, shortcuts

- Ctrl+K centered command palette with two commands: Open Prompts, Switch Workspace.
- Prompts modal: CRUD, favorites (star), favorites-first vs A→Z sort, search over title+body, Send-to-Terminal paste via last-focused pty.
- `useLastTerminal` tracks the most recent pty focus.
- Ctrl+B toggles sidebar (grid columns animate 260 ↔ 0).

## Phase 6 — polish

- Statusbar with live info (workspace name, live session count, zoom %).
- `workspace:remove` IPC + sidebar hover trash + confirm dialog. Does not touch disk.
- `session:resumeClaude` spawns `claude --resume <id>` in a new grouped window/viewer; sidebar Sessions rows get a Play button that places the new window at an offset from existing.

## Phase 7 — live debug session (partial)

Attached via agent-browser on :9223. Fixed:

- `Dialog` components not wrapped in `React.forwardRef` (React 18) → radix Slot ref warning.
- `CommandPalette` missing `DialogDescription` → a11y warning.
- `PromptEditor.useEffect` depending on `prompt?.title` / `prompt?.body` → clobbered the field being typed after blur-commit triggered a re-sync.
- Zustand selectors returning `?? []` creating a fresh array each render → infinite re-render loop when opening a plan. Fixed via module-scope `EMPTY_RANGES = Object.freeze([])`.

Remaining live-app checks (end-to-end drag to terminal, diff flow, close-window dialog, camera persistence restore) tracked in GitHub issues. See HANDOFF.md.
