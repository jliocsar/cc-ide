# Rule · Scope discipline

These are explicitly out of scope for MVP and subsequent phases until the PRD says otherwise. Do not drift into them. Do not "set up hooks for later" — reserve only the minimum schema/UI slot, nothing more.

## Never in the current plan

- **Sandboxing** — session model carries an optional `sandboxId` and the canvas window titlebar reserves a slot for rendering it. No logic, no UI beyond that slot. If this changes, discuss first.
- **Teammates / agent teams** — no rendering of connected lines on the canvas; no nesting of teammates under parent sessions.
- **Workspace file explorer** — only Plans and Diffs get tree/list surfaces. No general-purpose file tree.
- **Voice input / transcription** — not part of any current phase.
- **Multi-monitor / multiple Electron windows** — single window only.
- **Auto-update / telemetry / crash reporting** — deferred.
- **VSCode Ctrl+P quick-open** — intentionally not built. The command palette is a centered modal, not a fuzzy file opener.
- **Non-git workspaces** — workspace registration validates the path via `git rev-parse --is-inside-work-tree`. Plain folders are rejected.
- **Sub-line / column-character selection in plans** — plan comments are line-ranges only to match the `@@ start,len @@` contract. Diffs may allow column selection per the PRD, but not yet implemented.

## Dependencies

Do not add new runtime or dev dependencies without asking the user first. The current set is in `package.json`. When in doubt, look for a way to do it with what's there (e.g. node-pty, xterm, zod, zustand, radix, lucide, cmdk).

## PRD deltas

The original PRD is GitHub issue #1. Material changes since the original plan are documented in the comments on that issue. Add a comment when you make another change that invalidates something in the PRD — don't edit the body.
