# Reference · Architecture & module map

Electron app. Three process zones; IPC is the only legal boundary.

```
src/
├── main/               # node environment; fs/git/tmux/pty live here
│   ├── index.ts        # BrowserWindow, app lifecycle, dev CDP flag
│   ├── ipc.ts          # channel handler registry (thin wrappers around modules)
│   └── modules/        # deep, testable modules
│       ├── workspace-registry.ts      # ~/.cc-ide/workspaces.json CRUD
│       ├── canvas-store.ts            # ~/.cc-ide/canvas/<workspaceId>.json
│       ├── prompts-store.ts           # ~/.cc-ide/prompts.json
│       ├── plan-fs-tree.ts            # ~/.cc-ide/plans/<workspaceId>/**
│       ├── session-discovery.ts       # read-only ~/.claude/projects/<slug>/*.jsonl
│       ├── tmux-adapter.ts            # `tmux` CLI: sessions + windows + viewer grouping
│       ├── pty-manager.ts             # node-pty holder; emits pty:data / pty:exit
│       ├── worktree-manager.ts        # git worktree list/create/delete + guardrail
│       ├── diff-provider.ts           # git status/diff + hunk parser
│       ├── hook-server.ts             # HTTP on 127.0.0.1:9224; Claude hook payloads
│       ├── agent-map.ts               # session_id ↔ canvas window correlation + teammate flag parser; Node emitter for tail modules
│       ├── subagent-tail.ts           # fs.watch-based jsonl tailer; emits parsed transcript lines to renderer
│       └── claude-hooks-installer.ts  # patches ~/.claude/settings.json + installs ~/.cc-ide/hooks/cc-ide-hook.sh
│
├── preload/
│   ├── index.ts        # exposes window.ccIde.invoke + window.ccIde.on via contextBridge
│   └── index.d.ts      # global Window type augmentation
│
├── renderer/
│   ├── index.html      # <html class="dark">, CSP, no inline scripts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── env.d.ts
│       ├── styles/globals.css         # tailwind v4 + shadcn CSS variables (dark-only)
│       ├── lib/
│       │   ├── ipc.ts                 # invoke / onEvent typed wrappers
│       │   ├── utils.ts               # cn()
│       │   └── drop-payload.ts        # DropPayload type + buildDropString()
│       ├── state/                     # zustand stores
│       │   ├── workspaces.ts
│       │   ├── sessions.ts
│       │   ├── sidebar-data.ts        # sessions/worktrees/diffs sidebar caches
│       │   ├── canvas.ts              # camera + windows
│       │   ├── tabs.ts                # Board + dynamic plan/diff/prompt tabs
│       │   ├── palette.ts             # palette+prompts modal open state
│       │   ├── prompts.ts             # prompts CRUD with search/sort
│       │   ├── plans-tree.ts          # plan tree + expanded state
│       │   ├── review-comments.ts     # per-tab range drafts; EMPTY_RANGES constant
│       │   ├── last-terminal.ts       # last-focused pty id (for prompt paste)
│       │   └── ui.ts                  # sidebarVisible toggle
│       ├── hooks/
│       │   └── use-canvas-persistence.ts  # save/load canvas per workspace, rehydrate ptys
│       └── components/
│           ├── shell/
│           │   ├── shell.tsx          # layout root + global shortcuts
│           │   ├── sidebar.tsx        # Workspaces + accordions
│           │   ├── header-tabs.tsx    # Board pinned + dynamic tabs (draggable)
│           │   ├── tab-router.tsx     # activeTab.kind → Canvas | viewers
│           │   ├── statusbar.tsx
│           │   └── sections/          # sidebar accordions
│           │       ├── sessions-section.tsx
│           │       ├── worktrees-section.tsx
│           │       ├── plans-section.tsx
│           │       └── diffs-section.tsx
│           ├── canvas/
│           │   ├── canvas.tsx         # viewport, wheel zoom, pan, toolbar
│           │   ├── window-frame.tsx   # titlebar drag + resize handle
│           │   └── xterm-window.tsx   # xterm content + drop target + close dialog
│           ├── terminal/
│           │   └── xterm-view.tsx     # xterm.js binding; pty data in/out via IPC
│           ├── viewers/
│           │   ├── plan-viewer.tsx    # line-numbered plan + range comments panel
│           │   ├── diff-viewer.tsx    # side-by-side hunks + line selection on new
│           │   └── prompt-viewer.tsx  # stub (palette modal is the real UX)
│           ├── palette/
│           │   ├── command-palette.tsx    # Ctrl+K entry
│           │   └── prompts-modal.tsx      # full CRUD + paste-to-terminal
│           └── ui/                    # shadcn-generated components (do not edit unless rule says so)
│
└── shared/
    ├── ipc.ts                         # THE contract; Zod schemas + derived types
    ├── comment-serializer.ts          # drop-string generator (spec-critical)
    ├── comment-serializer.test.ts
    └── sanity.test.ts
```

## Deep-module doctrine

A "deep module" in this project means:

- One file, ~50–250 lines.
- Stateless or holds only process-local state (maps, caches).
- Public surface is small and doesn't leak types from its platform (no Electron types, no fs handles).
- Has its own `*.test.ts` alongside. Tests spawn temp dirs or git repos when needed — they don't mock fs.

When a module gets too big or starts importing Electron APIs, split it: move the Electron-aware wiring up into `src/main/ipc.ts`.

## State stores

Each zustand store lives in `src/renderer/src/state/<thing>.ts`. Rules in `../rules/state-patterns.md`. Stores avoid cross-dependencies where possible; the few coupled ones coordinate through hooks (`use-canvas-persistence.ts` reads `workspaces` + `canvas` + `sessions`).

## Tmux topology

See `tmux-model.md`.

## Canvas math

See `canvas-model.md`.
