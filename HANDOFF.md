# Handoff — start here

Welcome to `cc-ide`. MVP shipped across 6 phases; Phase 7 closed live-debug bugs; Phase 8 shipped backlog (#8–#12) + UX; Phase 9 made plans editable (CM6 + Vim/VSCode keybinds + Edit/Review modes). **Phase 10 added project-scoped prompts and moved plans storage into the workspace** — see "What Phase 10 added" below. **v0.1 ready.**

No open work items other than the future-features trackers (#3–#7), the Phase 9 deferrals (below), and a short list of Phase 10 follow-ups (below). Don't start those without talking to JC.

## Read in this order

1. `CLAUDE.md` — the agent entrypoint with links into rules + references.
2. `.claude/rules/*` — non-negotiable patterns. The state-patterns and drop-format rules in particular will save you hours.
3. `.claude/references/phase-summary.md` — what each phase shipped.
4. `.claude/references/lessons.md` — the bugs we already hit. Don't re-introduce them.
5. `.claude/references/architecture.md` — module map.
6. GitHub issue #1 (PRD) and its comments — source of truth for feature scope.

Read everything above before touching code. ~20 minutes total.

## Current state

- `main` branch at Phase 10 close-out.
- 174 tests across 17 files, all green. `pnpm typecheck` clean. `pnpm build` clean.
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

## What Phase 9 added

Plans opened from the sidebar are now editable inside their tab, with two modes and per-user keybinds. Review mode preserves the existing "click to comment, drag to terminal" flow — only the selection semantics changed.

- **CM6 editor** (`src/renderer/src/components/editor/plan-editor.tsx` + `plan-editor-extensions.ts`). One always-mounted `EditorView` per plan tab. Per-instance `Compartment`s (via `createPlanCompartments()`) hot-swap the keymap, `readOnly`, `editable`, and review-pointer extensions. **Do not revert to module-level compartments** — that silently breaks mode/keymap swap when two plan tabs are open.
- **Edit vs Review mode** (`src/renderer/src/state/plan-tab-ui.ts`). Segmented `[Edit] [Review]` toggle in the plan viewer header, default `Review`, per-tab, `Ctrl+Shift+M` toggles. Review mode adds `EditorState.readOnly(true)` + `EditorView.editable(false)` + a pointerdown capture extension; the content node gets a `.cm-review-mode` class that hides caret/active-line/cursor-layer via theme rules.
- **Review-mode line selection**: `Ctrl/Cmd+click` starts a 1-line range; `Ctrl/Cmd+click-and-drag` extends it (pointer capture on the CM6 content for plans; React `onPointerDown/Move/Up` on half-lines for diffs). Plain clicks are no-ops. Shift-extend was dropped in favor of the drag semantics. Hint text in the comments panel was updated to match.
- **Range auto-tracking through edits** — pure helper `src/shared/review-range-map.ts` maps `{start, len}` line ranges through a CM6 `ChangeSet` using `mapPos` with asymmetric associativity (start=+1, end=-1) so inserts above shift ranges down, trailing inserts don't extend them, and collapsed ranges drop. Wired into the editor's `updateListener`. 10 golden tests in `review-range-map.test.ts` lock the edge cases.
- **GFM markdown highlighting**. `@codemirror/lang-markdown` with `markdownLanguage` as base (tables, task lists, strikethrough, autolinks). Custom `ViewPlugin` + `MatchDecorator`-free line scanner tags GitHub-style callouts (`[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`) with accent-colored left borders. Monochrome palette rule is preserved — callouts are the only reserved chromatic surface in plan markdown. Mermaid is NOT in scope.
- **Settings infrastructure**. File at `~/.cc-ide/settings.json`, version-locked JSON, atomic write + corrupt-file recovery (mirrors `prompts-store`). Nested Zod schema `{ editor: { keybinds: 'vscode' | 'vim' } }` — keep new settings nested so the shape grows cleanly. Channels: `settings:get`, `settings:set`, event `settings:changed` broadcast on write. Renderer: `useSettings` zustand, hydrated from `App.tsx` via `bootstrapSettings()`.
- **Settings modal** (`src/renderer/src/components/settings/settings-modal.tsx`) opened by Ctrl+K → "Open Settings". shadcn Dialog, a Select for keybinds. Add future settings as new sections, not new modals.
- **Vim keybinds** via `@replit/codemirror-vim` (NOT `@codemirror/vim` — that package does not exist on npm). `:w` registered once via `Vim.defineEx` against a module-level `activeSaveTarget` updated on focus; every mounted PlanEditor re-registers its view on focus so `:w` always targets the focused tab. Vim mode label (`NORMAL` / `INSERT` / `VISUAL` / `REPLACE`) is tracked in `useplanTabUi.vimModeByTab` by reading `getCM(view).state.vim` from the `updateListener`.
- **Statusbar Vim pill** (`src/renderer/src/components/shell/statusbar.tsx`). Leftmost slot when the active tab is a plan AND `settings.editor.keybinds === 'vim'`. Context-aware: hides on non-plan tabs or when keybinds = vscode.
- **Save model** (MVP). Explicit save only: `Ctrl+S` via a high-precedence CM6 keymap, Vim `:w` routes to the same path. Dirty flag flips on any doc change that diverges from `lastSavedRef`. Tab title gets a `•` prefix when dirty. `closeTab` from the tab bar X OR Ctrl+W routes through `requestClose` → shared `AlertDialog` ("Discard & close" / "Keep editing"). `pendingCloseId` lives in `plan-tab-ui` so the shell's Ctrl+W and the header's X use the same dialog.
- **Tab drag for plans** already worked via `HeaderTabs.tsx` (tab chips set `application/x-cc-ide-drop` on dragstart). Ranges are read at drop time in `XtermWindow.handleDrop` via `useReviewComments.getState().ranges(tabId)`. No viewer-side drag source existed to remove.
- **Selection / active-line / cursor contrast**: theme rules in `plan-editor-extensions.ts` tune text contrast against bright backgrounds. Notably `.cm-fat-cursor` (Vim block cursor) is forced to `color: var(--primary-foreground)` so the single character under the block stays legible — upstream Replit defaults inherit the char's original color, causing white-on-white in dark mode.
- **New deps**: `codemirror`, `@codemirror/{state,view,commands,search,language,lang-markdown}`, `@lezer/highlight`, `@replit/codemirror-vim`. All approved by JC before install. `@codemirror/vim` is NOT a real package — do not reinstall under that name.

## What Phase 10 added

Two things: project-scoped prompts (new surface) and a fix to plans storage so the `@.cc-ide/plans/<rel>.md` drop path resolves to a real file that Claude can read.

- **Project-scoped prompts** — new sidebar section between Plans and Diffs. Files live at `<workspace>/.cc-ide/prompts/**/*.md`. Tree structure, full CRUD (create file, create folder, rename, delete, drag-to-move-with-spring-expand), mirrors Plans exactly. Opens in a tab with `MarkdownFileEditor` (see below), always in edit mode — no review flow. Drag a prompt into a terminal and it pastes `@.cc-ide/prompts/<rel>.md\n` — Claude resolves the real file because it's inside the workspace.
  - Main: `src/main/modules/prompts-fs-tree.ts` (+ `*.test.ts`, 23 tests).
  - IPC: `prompts:list|read|write|create|createFolder|rename|delete`, event `prompts:changed`.
  - Renderer state: `src/renderer/src/state/prompts-tree.ts`.
  - Sidebar: `src/renderer/src/components/shell/sections/prompts-section.tsx` + `PromptsAccordion` in `sidebar.tsx`.
  - Viewer: `src/renderer/src/components/viewers/prompt-viewer.tsx` (was a phase-6 stub — now real).
- **Global Prompt Store** (rename only). What used to be "Prompt Store" (Ctrl+K) is now "Global Prompt Store." Same modal, same `~/.cc-ide/prompts.json` storage, same body-paste-to-terminal behavior. IPC channels renamed: `prompts:list|create|update|delete` → `globalPrompts:*` to make room for the new file-tree-shaped `prompts:*` family. Command-palette label updated.
- **Plans storage fix (data migration)**. Plans used to live at `~/.cc-ide/plans/<workspaceId>/` but the drop path was `.cc-ide/plans/<rel>.md` relative to the workspace — the path was symbolic fiction and only worked because review drops inline the comment bodies. Plans now live at `<workspace>/.cc-ide/plans/**/*.md`, same shape as prompts. `plan-fs-tree.ts` takes `workspacePath` instead of `workspaceId`. A one-shot migration (`migrateLegacyIfNeeded(workspaceId, workspacePath)`) runs on the first `plans:tree` call per workspace and moves legacy content into place. Safe: refuses to migrate if the destination already has content (legacy is left intact + a warning is logged — no silent data loss). 7 new migration tests.
  - Tell users to add `.cc-ide/` to their `.gitignore`.
- **`MarkdownFileEditor`** — `PlanEditor` renamed to `MarkdownFileEditor` in `src/renderer/src/components/editor/markdown-file-editor.tsx`. Accepts `onSave: (content: string) => Promise<void>` + optional `reviewCapable: boolean` (default false). Plan viewer passes `reviewCapable` and an `onSave` that calls `plans:write`; prompt viewer passes a prompt-save. Vim `:w` still routes through the module-level `activeSaveTarget`; both editors share the handler. The old `plan-editor-extensions.ts` is unchanged.
- **Tab kind `prompt` repurposed**. Was speculative plumbing with meta `{promptId}` and zero callers. Now meta `{workspaceId, relPath}`, tab id `prompt:${workspaceId}:${relPath}`, fully wired. `rewritePromptTabsForMove` mirrors `rewritePlanTabsForMove`; both are now driven by a shared `remapKind` helper in `state/tabs.ts`.
- **`DropPayload` extended** with `kind: 'prompt'`. Synth path `.cc-ide/prompts/${relPath}`. Zero-range drops emit `@<path>\n` via the existing `buildDropString`. `xterm-window.handleDrop` short-circuits for prompt payloads — no `useReviewComments` lookup.
- **Prompts fs watcher** (`watchers.ts`) — `ensurePromptsWatcher(workspaceId, workspacePath)` watches `<workspace>/.cc-ide/prompts/` and emits `prompts:changed`. Sidebar subscribes in `sidebar.tsx` alongside the plans watcher. `ensurePlansWatcher` got the same signature update (now takes workspacePath).

### Phase 10 deferrals / follow-ups

- **Plans migration UX**: the `skipped-dest-populated` path just logs a warning. If a user somehow has both legacy AND new content, they need to merge manually. Low priority — unlikely to hit in practice.
- **Prompts sidebar sort**: tree lists dirs then files alphabetical. No favorites, no recency sort (prompts intentionally simpler than the global store).
- **`.gitignore` hint**: we don't auto-detect or suggest adding `.cc-ide/` to `.gitignore`. Consider a one-time toast on first prompt/plan creation.
- **Own-write watcher suppression (still open from Phase 9)** is now more visible with two fs watchers firing on every save.

### Phase 9 deferrals (intentionally out of scope, worth tracking)

- **Sidebar collapse UI for review comments**. Entry fields `sidebarCollapsed` and `autoExpandedOnce` exist on `plan-tab-ui` already; UI (edge chevron + 32px rail with range-count badge) was not wired. Cheap follow-up.
- **Workspace-switch batch save dialog**. Currently a workspace switch does not block on unsaved plan tabs. Should show a "Save all / Discard all / Cancel" list before swapping.
- **External-change detection banner**. If the plan file mtime changes on disk while a tab is dirty (e.g. Claude rewrote it from a terminal session), we should surface a "[Reload and lose changes] [Keep mine]" banner. Currently the buffer wins silently on save.
- **Own-write watcher suppression**. The plans fs watcher still fires on our own `plans:write` calls, causing a sidebar re-render per save. Compare write timestamps in `watchers.ts` and skip events within a short window.
- **agent-browser live walkthrough.** Build + typecheck + unit tests were green when Phase 9 shipped, but a live click-through of the mode toggle, keybind swap, drag-to-terminal with ranges, and Vim `:w` flow wasn't run. Recommended before the first v0.1 release cut.

### Files that changed in Phase 10

- `src/main/modules/prompts-fs-tree.ts` + `.test.ts` (new, 23 tests)
- `src/main/modules/plan-fs-tree.ts` — refactored to `workspacePath`, added `migrateLegacyIfNeeded` + `__setLegacyBaseForTests`
- `src/main/modules/plan-fs-tree.test.ts` — rewritten for the new signature + 7 migration tests
- `src/main/modules/watchers.ts` — `ensurePromptsWatcher`, `ensurePlansWatcher` takes workspacePath
- `src/main/ipc.ts` — `prompts:*` handlers, `globalPrompts:*` rename, plans handlers resolve workspaceId→workspacePath + run migration
- `src/shared/ipc.ts` — `prompts:*` file-tree channels, `globalPrompts:*` rename, `prompts:changed` event
- `src/renderer/src/state/prompts-tree.ts` (new), `state/prompts.ts` — channel rename, `state/tabs.ts` — prompt tab meta + `remapKind`
- `src/renderer/src/components/shell/sections/prompts-section.tsx` (new), `shell/sidebar.tsx` — `PromptsAccordion`
- `src/renderer/src/components/editor/markdown-file-editor.tsx` (renamed from `plan-editor.tsx`, now parameterized)
- `src/renderer/src/components/viewers/plan-viewer.tsx` — uses `MarkdownFileEditor`
- `src/renderer/src/components/viewers/prompt-viewer.tsx` — real viewer, was a stub
- `src/renderer/src/components/shell/tab-router.tsx` — prompt tab wired with `{workspaceId, relPath}`
- `src/renderer/src/components/canvas/xterm-window.tsx` — prompt-drop short-circuit
- `src/renderer/src/components/palette/{prompts-modal,command-palette}.tsx` — "Global Prompt Store" labels
- `src/renderer/src/lib/drop-payload.ts` — `kind: 'prompt'`
- `.claude/references/data-paths.md` — new workspace-owned paths section, migration note

### Files that changed in Phase 9

- `src/main/modules/settings-store.ts` + `.test.ts`
- `src/shared/review-range-map.ts` + `.test.ts`
- `src/main/ipc.ts` — settings handlers + broadcast
- `src/shared/ipc.ts` — settings schemas, channels, event
- `src/renderer/src/state/{settings,plan-tab-ui}.ts` (new)
- `src/renderer/src/state/review-comments.ts` — added `replaceAll` action
- `src/renderer/src/components/editor/{plan-editor,plan-editor-extensions}.ts` (new)
- `src/renderer/src/components/settings/settings-modal.tsx` (new)
- `src/renderer/src/components/viewers/plan-viewer.tsx` — rewritten, segmented toggle, mode wiring
- `src/renderer/src/components/viewers/diff-viewer.tsx` — pointerdown/move/up click semantics
- `src/renderer/src/components/palette/command-palette.tsx` — Open Settings entry
- `src/renderer/src/components/shell/shell.tsx` — SettingsModal mount + Ctrl+W dirty check
- `src/renderer/src/components/shell/header-tabs.tsx` — dirty dot + close confirm
- `src/renderer/src/components/shell/statusbar.tsx` — Vim mode pill slot
- `src/renderer/src/App.tsx` — `bootstrapSettings()`

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
- Close the open polish issues on GitHub (Phase 8 + 10 fixes are in code — needs a PR + issue close).
- Knock out the Phase 9 deferrals above (sidebar collapse, batch save dialog, external-change banner, own-write watcher suppression, agent-browser walkthrough).
- Knock out the Phase 10 follow-ups above (`.gitignore` hint, watcher suppression more relevant with two fs roots now).
- Start a future-features spike (#3–#7) — sandboxing, teammates, voice, etc. All require PRD alignment first.
- Quality pass: bump test coverage on the new watchers + tabs-store + cat-name-gen modules. Watchers still have no integration test.

Good luck. Clean tree.
