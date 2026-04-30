<div align="center">
<img src=".github/assets/hero.png" />
</div>

# cc-ide

> **Work in progress.** The app is functional and serves its purpose well — sessions, canvas, plans, diffs, prompts, and the full drop workflow all work end-to-end. Rough edges exist. Self-build instructions below.

Electron desktop app to orchestrate multiple Claude Code instances across projects, worktrees, and a spatial canvas with PR-review-style plan and diff feedback that drags directly into any running Claude.

## What it does

- **Register git workspaces** and switch between them from the sidebar or command palette.
- **Spawn and resume Claude sessions** backed by tmux. Each workspace gets one tmux session; each Claude instance gets its own window; each canvas window gets an isolated grouped viewer so multiple windows can view different Claudes at once.
- **Spatial canvas** — pan, zoom, drag, and resize xterm.js windows. Per-workspace layout is persisted. Subagent and teammate windows appear automatically when Claude spawns them.
- **Plans** — per-workspace markdown tree under `$HOME/.cc-ide/plans/<workspaceId>/`. Open a plan, click/shift-click lines to build comment ranges, drag the tab into a Claude window and the exact `@.cc-ide/plans/...md` + `@@ start,len @@` block is pasted in.
- **Diffs** — per-worktree staged+unstaged changes in a side-by-side view. Comment on lines; drag into Claude the same way.
- **Prompts** — cross-project prompt library with search, favorites, and one-key paste into the last-focused terminal (`Ctrl+K` → Open Prompts).
- **Worktrees** — list, create, and safely delete (guardrail: no uncommitted changes + pushed to remote).
- **Dependency graph** — live TypeScript import graph for the active workspace, rendered on the canvas as a force-directed layout.
- **Markdown preview** — plan viewer renders markdown with syntax highlighting, Mermaid diagrams, and pan/zoom.
- **Settings** — font picker, data-root config, and other preferences in a dedicated tab.

## Stack

Electron 33, React 18, TypeScript strict, Vite via `electron-vite`, Zustand, Zod, Tailwind v4, shadcn/ui, cmdk, Lucide, xterm.js, node-pty, Vitest. pnpm.

## Requirements

- Node 20+
- `tmux` on `PATH`
- `git` on `PATH`
- Claude Code CLI (`claude`) on `PATH` — spawned by the IDE

## Scripts

```bash
pnpm install          # installs deps + rebuilds node-pty against electron
pnpm dev              # electron-vite dev server + CDP on 9223 (set CC_IDE_DEVTOOLS=1 to auto-open DevTools)
pnpm build            # typecheck + build main/preload/renderer
pnpm test             # vitest run
pnpm test:watch       # vitest watch
pnpm typecheck        # tsc --noEmit (composite)
pnpm rebuild          # re-bind node-pty to electron's ABI
```

## Data layout

IDE data (writable):

```
$HOME/.cc-ide/
├── workspaces.json                    # registry (UUID ids + display name)
├── prompts.json                       # cross-project prompts
├── canvas/<workspaceId>.json          # camera + windows per workspace
└── plans/<workspaceId>/**/*.md        # plan tree
```

Claude data (read-only):

```
~/.claude/projects/<slug>/*.jsonl      # Claude's own session transcripts
```

## Keyboard shortcuts

Press **F1** in the app to see all available shortcuts.
