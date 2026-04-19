# Handoff — start here

Welcome to `cc-ide`. MVP shipped across 6 phases; Phase 7 closed live-debug bugs; Phase 8 shipped backlog (#8–#12) + UX; Phase 9 made plans editable (CM6 + Vim/VSCode keybinds + Edit/Review modes). Phase 10 added project-scoped prompts and moved plans storage into the workspace. Phase 11 shipped a UX/correctness sweep. **Phase 12 was a typography + UI polish pass plus diffs batch-drop — read "What Phase 12 added" below.** **v0.1 ready.**

No open work items other than the future-features trackers (#3–#7), the Phase 9 deferrals (below), and a short list of Phase 10/11 follow-ups (below). Don't start those without talking to JC.

## Read in this order

1. `CLAUDE.md` — the agent entrypoint with links into rules + references.
2. `.claude/rules/*` — non-negotiable patterns. The state-patterns and drop-format rules in particular will save you hours.
3. `.claude/references/phase-summary.md` — what each phase shipped.
4. `.claude/references/lessons.md` — the bugs we already hit. Don't re-introduce them.
5. `.claude/references/architecture.md` — module map.
6. GitHub issue #1 (PRD) and its comments — source of truth for feature scope.

Read everything above before touching code. ~20 minutes total.

## Current state

- `main` branch at Phase 11 close-out.
- 187 tests across 18 files, all green. `pnpm typecheck` clean. `pnpm build` clean.
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

## What Phase 12 added

Typography + UI polish pass, plus diffs-section batch-drop feature.

### Fonts

- **Google Fonts** loaded via `<link>` in `src/renderer/index.html`. CSP updated: `style-src` allows `fonts.googleapis.com`; `font-src` allows `fonts.gstatic.com`. Loaded: Geist, Geist Mono, Space Grotesk (kept in bundle even though sidebar switched away — harmless).
- **CSS font variables** in `src/renderer/src/styles/globals.css` (`@theme inline`):
  - `--font-sans`: Geist
  - `--font-mono`: Geist Mono
  - `--font-condensed`: Space Grotesk (registered but not currently used in sidebar)
- **Body font** changed from system-ui stack → `var(--font-mono)` (Geist Mono everywhere by default).
- **Plan/markdown editor** (`plan-editor-extensions.ts`) explicitly sets `fontFamily: var(--font-sans)` (Geist) so markdown content stays readable.
- **code/pre/kbd/samp** elements get `font-family: var(--font-mono)` via `@layer base`.
- **`geist-features` utility** (`globals.css`): applies `font-feature-settings: "cv11", "ss01"` — used on sidebar section headers.

### Sidebar section headers (`SectionHeader` in `sidebar.tsx`)

- Font: Geist Mono (`var(--font-mono)`) with `geist-features`.
- Size: 11px (was 10px), weight 500, uppercase, letter-spacing 1px, line-height 14.5px, `select-none`.
- Color: `text-foreground/40`.
- Padding: `px-2` (was `px-3`).
- **Accordion chevron** moved to left of icon (before `{children}` in `accordion.tsx`): `size-3`, `text-foreground/25`, no translate.
- Layout order: `▾ {icon} {label} ({count}) {spacer} {actions}`.

### Diffs section (`diffs-section.tsx`)

- **Branch name pill removed** — was `rounded border border-border bg-muted/40 px-1.5 py-0.5`. Now plain text, same color as the rest of the row.
- **Branch + file count merged** into one flex row with a `·` separator. Branch caps at `max-w-[22ch]` + truncates independently so the count is always visible. Dot is `text-foreground/40`; branch + count row is `text-foreground/50`.
- **Refresh button** darkened to `text-foreground/50` with `hover:text-foreground/60`.
- **Border separator between worktrees removed** (was `border-b border-border pb-2 last:border-b-0`).
- **File row reordered** to: `{icon} {filename(flex-1)} {status badge} {comment count(yellow)} {+additions(green)} {-deletions(red)}`.
  - Comment count only shown when > 0, `text-yellow-400`.
  - Additions only shown when > 0, `+N` in `text-green-400`.
  - Deletions only shown when > 0, `-N` in `text-red-400`.
  - Removed the old combined `additions + deletions` single span.
- **Empty-worktree spacing**: worktrees with no files get `mb-0.5` (was `gap-2` uniform). Worktrees with files get `mb-2`.
- **Branch-row comment summary**: when any file in the worktree has review comments, the branch row shows `· {total} {MessageSquare icon}` in yellow.
- **Branch-row batch drag**: branch header row is draggable when `totalComments > 0`. Drops a `diff-batch` payload → xterm pastes only the commented files (each serialized as if individually dragged, with their ranges), then clears their comment state. Files with no comments are skipped. New `kind: 'diff-batch'` in `src/renderer/src/lib/drop-payload.ts`; handled in `src/renderer/src/components/canvas/xterm-window.tsx`.

### Files changed in Phase 12

- `src/renderer/index.html` — CSP + Google Fonts `<link>` tags
- `src/renderer/src/styles/globals.css` — font vars, body font, code/pre rule, `geist-features` utility
- `src/renderer/src/components/ui/accordion.tsx` — chevron moved left, resized + darkened
- `src/renderer/src/components/shell/sidebar.tsx` — `SectionHeader` typography overhaul (font size 11px)
- `src/renderer/src/components/shell/sections/diffs-section.tsx` — branch/count row, file row reorder, colors, empty spacing, comment summary, batch drag
- `src/renderer/src/components/editor/plan-editor-extensions.ts` — fontFamily → `var(--font-sans)`
- `src/renderer/src/lib/drop-payload.ts` — `diff-batch` DropPayload kind + `dropPathFor` guard
- `src/renderer/src/components/canvas/xterm-window.tsx` — `diff-batch` handler in `handleDrop`
- `.gitignore` — `electron.vite.config.*.mjs` artifact pattern

## What Phase 11 added

UX + correctness sweep across 11 bugs/features in one session. Mostly small per-file changes — but a few shape the project's invariants going forward.

### Drop-format contract change (BREAKING — read this)

**Paths with whitespace in the drop format are now wrapped in double quotes.** Embedded `"` in such paths is escaped as `\"`. Paths without whitespace stay bare.

- Old: `@.cc-ide/plans/My Plan.md` (Claude tokenized at the space → broken)
- New: `@".cc-ide/plans/My Plan.md"`

Why: Claude tokenizes on whitespace, so unquoted spaces broke the parse. The serializer's old "no escaping or quoting, even when it contains spaces" guarantee is **gone** — the previous golden test that locked it has been replaced by tests asserting the new behavior.

Files: `src/shared/comment-serializer.ts` (`formatDropPath` helper), `src/shared/comment-serializer.test.ts` (3 new/changed tests), `src/renderer/src/lib/drop-payload.ts` (`buildDropString` no-ranges branch + `setDropPayload` text/plain fallback both use `formatDropPath`), `.claude/rules/drop-format.md` (rule rewritten).

### `.md` enforcement on plans + prompts (BREAKING — main side)

Files in plans/prompts trees MUST end in `.md`. Folders unaffected.

- Old: `createPlan(workspace, 'foo')` auto-appended `.md`.
- New: `createPlan(workspace, 'foo')` throws `plan filename must end in .md: foo`.

Renderer rejects at create + rename time via the new `validateMarkdownFilename` in `src/shared/markdown-name.ts`. Sidebar rename now routes through `InlineRenameInput` with a shadcn `Tooltip` showing the validation reason (replaces the old native `title=` attr + raw `<input>`). 11 new tests in `markdown-name.test.ts`. Plan/prompt fs-tree tests rewritten to pass `.md` explicitly.

### Board now mounted always

`tab-router.tsx` was unmounting Canvas every time the user switched to a non-board tab — disposing every xterm Terminal instance, leaving terminals black on return until the user interacted. Canvas now mounts once and stays mounted; non-board tabs render as an overlay above. Crucially the Canvas root uses `visibility:hidden + position:absolute` (NOT `display:none` — xterm's FitAddon needs measurable size).

Plus: `[&>*]:h-full [&>*]:w-full` selectors in the new wrappers because Canvas's own root has no intrinsic height — it relied on the previous direct grid-child relationship.

### xterm-view rework

- **Resize debounce**: `pty:resize` now fires 150ms after the last fit (`xterm-view.tsx`). `fit.fit()` still runs every observation. Old behavior flooded tmux + claude with SIGWINCH 60Hz during a window-frame drag, leaving the buffer half-rendered.
- **Workspace-switch redraw kick**: when the xterm Terminal remounts onto an existing pty, tmux thinks nothing changed and doesn't redraw — leaving the new xterm blank ("alt+tab to fix"). Solution: the resize trick — issue `pty:resize cols-1` then immediately `pty:resize cols`, forcing a real SIGWINCH cascade. Tmux responds with a full screen redraw. (Tried `tmux refresh-client -t <session>` first — turns out `-t` requires a client TTY, not a session name. Pure renderer trick is simpler and works.)
- **Clipboard sync**: tmux server option `set-clipboard on` set in `tmux-adapter.ensureSession` so tmux emits OSC 52 on copy-mode yank. New `clipboard:write` IPC channel routes to `electron.clipboard.writeText`. xterm-view registers `term.parser.registerOscHandler(52, ...)` (with `allowProposedApi: true` on the Terminal) and a `term.attachCustomKeyEventHandler` for Ctrl+Shift+C / Cmd+C. **Both** mouse-select and tmux copy-mode now land in the system clipboard.

### Viewer tmux sessions are hardened + isolated

Two changes to make canvas windows behave like raw terminals:

**Hardening** — `tmux.hardenViewerSession(viewerName)` runs after every `createViewerSession`:

- `set-option -t <viewer> status off` — hides the tmux tab bar.
- `set-option -t <viewer> prefix None` + `prefix2 None` — disables all tmux key bindings inside the viewer pty. User can't `prefix+c` to create windows, can't `prefix+%`/`"` to split, can't `prefix+d` to detach.

**Isolation** — `createViewerSession` no longer uses `new-session -t primary` (linked group). Instead it creates a standalone session with a placeholder window, then `link-window -k -s primary:target -t viewer:0` to slot in only the target. This matters because:

- Linked groups share ALL windows. When one Claude exited, the viewer auto-switched to a sibling window — leaving the canvas window showing a different live Claude (visible bug once `status off` hid the switch).
- Standalone session with one linked window means: target window dies → viewer has 0 windows → viewer session dies → pty exits → Shell's `pty:exit` listener removes the canvas window cleanly. New windows added to primary stay invisible to existing viewers.

All per-session — primary untouched, user's `~/.tmux.conf` never read by us. Only applies to NEW viewer sessions; existing ones must be respawned.

### Sessions: dedupe across workspace switches

Switching workspaces back-and-forth used to add a duplicate `SessionRecord` per round-trip. Cause: canvas snapshot strips `sessionId`, hydrate restores with `sessionId: null` (dormant), `rehydrateLiveSessions` then spawns a NEW viewer pty + calls `registerExisting` → second record for the same `tmuxWindow`.

Fix: new `relinkExistingSessions(workspaceId)` in `use-canvas-persistence.ts` runs immediately after hydrate. It finds dormant windows whose `tmuxWindow` matches an existing live `SessionRecord` and reuses that `ptyId`. Only windows with no matching record fall through to the spawn-fresh path. Side benefit: keeps the same viewer pty alive across switches, so xterm reconnects to the same screen state (paired with the redraw kick above).

### Atomic-write race fix (canvas/tabs/settings/prompts stores)

All four store modules used the same atomic-write pattern: write to `<id>.json.tmp`, rename to `<id>.json`. Two concurrent saves for the same key (e.g. debounced + workspace-switch forced save) collided on the shared tmp path → first rename consumed it, second ENOENTed. Fix: per-write randomized tmp suffix (`<id>.<uuid>.tmp`) so each write owns its tmp; later rename wins (correct for debounced-save semantics). Wrapped in try/catch with best-effort tmp cleanup on failure.

### Diff viewer "no diff" empty state

When a diff tab's file gets committed, `diff.hunks` becomes `[]` — the viewer used to render a blank white panel. Now shows a centered card explaining the file is no longer in the diff and to close the tab manually. The tab itself stays open (user closes when ready).

### Tab drag UX

`header-tabs.tsx` reorder used to feel sluggish — HTML5 DnD's OS-rendered drag image (a screenshot of the tab) felt heavy and reorder only happened on `drop`. Now: 1×1 transparent drag image via `setDragImage` kills the screenshot, and `reorderTab` fires on `dragover` for live reorder. Dragged tab gets `opacity-60`. Drop-onto-terminal flow (different MIME) is untouched.

### Vim selection visible

`plan-editor-extensions.ts:168` selection alpha 12% → 30%. The 12% was barely perceptible against the dark bg, especially in vim visual mode.

### xterm lineHeight is 1.2 (UNCHANGED — but verified)

Briefly tried changing `lineHeight: 1.2` → 1 to fix a click-Y-axis selection bug (clicking bottom of terminal selected the top). lineHeight wasn't the cause — restored to 1.2 since JC prefers the visual breathing room. **Click-Y bug is still open** — see Phase 11 deferrals.

### Files that changed in Phase 11

- `src/shared/comment-serializer.ts` + `.test.ts` — `formatDropPath`, contract change
- `src/shared/markdown-name.ts` + `.test.ts` (new, 11 tests)
- `src/shared/ipc.ts` — added `clipboard:write` channel
- `src/main/ipc.ts` — `clipboard:write` handler
- `src/main/modules/tmux-adapter.ts` — `set-clipboard on` in `ensureSession` + `hardenViewerSession`
- `src/main/modules/canvas-store.ts` — randomized tmp + try/catch
- `src/main/modules/tabs-store.ts` — same
- `src/main/modules/settings-store.ts` — same
- `src/main/modules/prompts-store.ts` — same
- `src/main/modules/plan-fs-tree.ts` — reject non-`.md` in createPlan + rename
- `src/main/modules/prompts-fs-tree.ts` — same
- `src/main/modules/{plan,prompts}-fs-tree.test.ts` — rewritten createPlan/createPrompt tests
- `src/renderer/src/components/shell/tab-router.tsx` — board mount-always pattern
- `src/renderer/src/components/shell/header-tabs.tsx` — live-reorder + transparent drag image
- `src/renderer/src/components/shell/sections/plans-section.tsx` — InlineRenameInput integration
- `src/renderer/src/components/shell/sections/prompts-section.tsx` — same
- `src/renderer/src/components/ui/inline-rename-input.tsx` — added shadcn Tooltip wrap
- `src/renderer/src/components/terminal/xterm-view.tsx` — debounced resize + clipboard handlers + workspace-switch redraw kick
- `src/renderer/src/components/editor/plan-editor-extensions.ts` — selection alpha 12 → 30
- `src/renderer/src/components/viewers/diff-viewer.tsx` — no-diff empty state
- `src/renderer/src/lib/drop-payload.ts` — quote in buildDropString + text/plain
- `src/renderer/src/hooks/use-canvas-persistence.ts` — `relinkExistingSessions`
- `.claude/rules/drop-format.md` — rule rewritten

### Phase 11 deferrals

- **Click-Y axis bug in xterm** still open. Symptom: clicking near the bottom of an xterm window selects text near the top (Y miscalculation in xterm's hit-test). Tried lineHeight first — not the cause. Needs live debug via `agent-browser connect 9223` (start dev with `CC_IDE_DEVTOOLS=1`). Likely candidate: parent CSS transform on the canvas viewport (`scale()`) interfering with xterm's `getBoundingClientRect`-based hit-testing.
- **Orphan tmux viewer sessions accumulate**. `tmux ls` showed many `ccide-*-v-*` sessions still alive long after their ptys died. The `pty.onExit` callback runs `killViewerSession`, but if Electron crashes or is killed before that fires, the sessions leak. Consider a startup sweep: list `*-v-*` sessions whose names don't match any active pty and kill them.
- **`set-clipboard on` is set every `ensureSession`** even though it's a server-level option (idempotent). Cosmetic — could move to a one-shot init.

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
