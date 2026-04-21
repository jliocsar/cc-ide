# Rule · Claude hooks integration

cc-ide owns an HTTP server at `http://127.0.0.1:9224` that receives resolved
Claude hook events (SessionStart, SubagentStart, SubagentStop) from a small
bash bridge script. The contract here is load-bearing — if it drifts, teammate
and subagent windows stop spawning.

## Boundary

- `~/.claude/settings.json` is user-owned; we add entries only. Never rewrite
  hooks we don't own, never reorder. Ownership marker: the hook command
  contains `/.cc-ide/hooks/`.
- `~/.cc-ide/hooks/cc-ide-hook.sh` is app-owned. Installed + overwritten on
  every launch. Users should not edit it — edits are lost.
- No dependency on a running IDE: if the HTTP server is down, the hook script
  `curl` fails silently (`-m 2 || true`). Claude keeps working. Users see no
  errors. Teammates/subagents just don't show up in the canvas.

## Patching `~/.claude/settings.json`

- Read → mutate → atomic write.
- For each of `SessionStart`, `SubagentStart`, `SubagentStop`: drop any existing
  entry whose command contains `/.cc-ide/hooks/` (our marker), then append our
  entry. This makes re-runs idempotent and lets us replace stale entries
  (e.g. port change) without duplicating.
- If the file is corrupt JSON, copy the raw contents to
  `settings.json.cc-ide-corrupt-<iso-timestamp>.bkp` and start from empty.
  Never discard the user's content without backing it up.

## The bridge script

One script, three endpoints. Claude invokes:

```
bash ~/.cc-ide/hooks/cc-ide-hook.sh <endpoint>
```

where `<endpoint>` ∈ {`session-start`, `subagent-start`, `subagent-stop`}.
The payload arrives on stdin (Claude's hook protocol). The script enriches
with four fields before POSTing:

- `cc_ide_window` — from `$CC_IDE_WINDOW`, injected by cc-ide at Claude spawn.
- `tmux_pane` — from `$TMUX_PANE` (present when Claude runs inside tmux).
- `tmux_socket` — from `$TMUX`, parsed at the first comma.
- `ppid_cmdline` — `/proc/$PPID/cmdline` (Linux) or `ps -o command=` (macOS).

JSON merging uses `jq` when present; otherwise a raw splice at the closing `}`
(values are shell-escaped). Do not add a hard `jq` dependency.

## Server-side

- `src/main/modules/hook-server.ts` owns the HTTP listener. Starts in
  `app.whenReady()`, stops in `before-quit`. Bound to `127.0.0.1` only.
  Failure to start must not block the app launch.
- Three POST endpoints, all Zod-validated. Unknown routes 404; bad JSON 400;
  handler errors 500.
- Dispatches to `src/main/modules/agent-map.ts`, which holds the
  `session_id → canvasWindow` correlation and broadcasts resolved
  `agent:teammateStart` / `agent:subagentStart` / `agent:subagentStop` events
  via the event bus.

## `CC_IDE_WINDOW` injection

Every Claude the IDE spawns gets its tmux window name as `CC_IDE_WINDOW`.
Injected in the tmux window command itself:

```
zsh -ic 'CC_IDE_WINDOW=<windowName> claude ...; exit'
```

Window names are validated upstream (`validateTmuxWindowName`) so no shell
escaping is required. If you add a new spawn path, it must set this env or
the Claude hook won't correlate to the window and the event is dropped.

## What must have tests

- `agent-map.ts` — cmdline flag extraction (both `--flag value` and
  `--flag=value` forms, teammate detection vs plain sessions) and the
  self-healing `sessionId → ccIdeWindow` map.
- `hook-server.ts` — start/stop on an ephemeral port; 405/404/400 paths;
  happy-path round trip for each of the three endpoints.
- `claude-hooks-installer.ts` — idempotency (re-runs don't duplicate
  entries), preservation of unrelated entries and unrelated hook events,
  replacement of stale cc-ide entries, corrupt-file backup behavior.

## What NOT to do

- Do not add hook entries anywhere other than `~/.claude/settings.json`
  (no project-local `.claude/settings.json` patching). Hooks must fire
  regardless of where Claude runs.
- Do not parse hook payloads in the renderer. Main resolves the event,
  renderer sees a typed `agent:*` broadcast.
- Do not use a long-lived daemon for the HTTP server — lifecycle tied to
  the Electron app is intentional. Events that arrive while the IDE is
  closed are gone and that's fine.
- Do not require an uninstall script for now. Users who want hooks gone
  can delete the three `cc-ide` entries from their settings manually.
