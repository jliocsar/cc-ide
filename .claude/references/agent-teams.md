# Reference · Claude agent-teams & subagents

How Claude Code's agent-teams and subagents behave on disk and in the process tree. Informs cc-ide's teammate/subagent canvas windows. All findings empirically verified 2026-04-20.

## Subagents (Task tool / SubagentStart hook)

Subagents are **subprocesses of the invoking Claude**, not independent Claude instances. They share the parent session's process tree and have no independent pty. You interact with them only by reading their transcript.

### Transcript location

Deterministic path, created at `SubagentStart`:

```
~/.claude/projects/<cwd-slug>/<parent-session-id>/subagents/agent-<agent-id>.jsonl
```

`<cwd-slug>` = cwd with `/` → `-`. Hidden dirs double up (`/home/jliocsar/.meine` → `-home-jliocsar--meine`).

### Hook payloads

`SubagentStart`:
```json
{
  "session_id": "<parent session>",
  "transcript_path": "<parent jsonl>",
  "agent_transcript_path": null,
  "cwd": "...",
  "agent_id": "a4c8de30038e444d1",
  "agent_type": "general-purpose",
  "teammate_name": null,
  "permission_mode": "auto"
}
```

`SubagentStop`: same + `last_assistant_message`. `agent_transcript_path` **is** the subagent's own `.jsonl` — same path as above.

Note: `transcript_path` on both events points at the **parent** session transcript; `agent_transcript_path` points at the **subagent** transcript.

### Transcript line shape

Every line has `"isSidechain": true` and `"agentId": "<id>"`. `sessionId` field inside the jsonl is the subagent's *own* id, distinct from `agentId`. Tool calls emit `type: "assistant"` with `message.content[].type = "tool_use"`; tool results come back on the next line as `type: "user"` with `message.content[0].type = "tool_result"` + `tool_use_id` linking back.

## Teammates (agent-teams / TeamCreate tool)

Teammates are **full independent Claude processes**, spawned by the team-lead via `tmux split-window` + `send-keys`. They share the user's tmux server and have their own pty. They are NOT invoked via the Task tool; no `SubagentStart` fires.

### Spawn command (observed)

```
env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 \
  /path/to/claude \
  --agent-id <name>@<team> \
  --agent-name <name> \
  --team-name <team> \
  --agent-color <color> \
  --parent-session-id <leader session id> \
  --agent-type general-purpose \
  --permission-mode auto \
  --model claude-opus-4-7
```

The team-lead drives the split; each teammate lands in its own tmux pane with its own tty.

### Detection

Teammates fire `SessionStart` (NOT `SubagentStart`). Their payload is distinguishable by the presence of an `agent_type` field:

- Plain session: `{session_id, transcript_path, cwd, hook_event_name, source, model}`
- Teammate session: adds `agent_type`.

Richer fields (`--parent-session-id`, `--team-name`, `--agent-name`, `--agent-color`) are only in the spawn cmdline, not in the hook payload. Our hook script reads `/proc/$PPID/cmdline` (Linux) or `ps -o command= -p $PPID` (macOS) to extract them.

### Process tree

Teammate Claude processes have `PPID` = the shell that the team-lead `send-keys`d into (i.e. a zsh/bash in a tmux pane). Multiple teammates may share the same PPID zsh if the lead spawned into the same pane sequentially, or have different PPIDs if split into different panes. Don't rely on PPID to correlate — use `--parent-session-id` from cmdline.

### Transcript location

Same directory as any Claude session, **not** under `subagents/`:

```
~/.claude/projects/<cwd-slug>/<teammate-session-id>.jsonl
```

Self-identifying: every non-bootstrap line carries `teamName` and `agentName`. `isSidechain: false` (distinguishes from subagents).

First two lines are always bootstrap:
1. `{"type":"agent-setting","agentSetting":"<agent-type>","sessionId":"..."}`
2. `{"type":"permission-mode","permissionMode":"<mode>","sessionId":"..."}`

The first user-role line is a synthetic `<teammate-message teammate_id="team-lead">` that the lead injects to coordinate the team.

### Pty / tmux attachment

Teammate process env includes:

- `TMUX=<socket>,<server-pid>,<session-id>` — e.g. `/tmp/tmux-1000/default,494209,0`
- `TMUX_PANE=%<paneId>` — globally unique within the tmux server.
- `TERM=screen-256color`, `TERM_PROGRAM=tmux`.

Given the socket + pane id, we can read the pane non-invasively from any process:

- `tmux -S <socket> capture-pane -p -J -e -t %<paneId>` — snapshot current scrollback, ANSI-preserved.
- `tmux -S <socket> pipe-pane -o -t %<paneId> 'cat >> <fifo>'` — stream live pane output to a fifo/file. Use `-o` to overwrite any prior pipe.
- `tmux -S <socket> pipe-pane -t %<paneId>` (no command) — stop streaming.

This is read-only and does not interfere with the user's tmux session. Direct reads from `/dev/pts/<n>` would steal bytes from the user's client — do not.

## Differences summary

|                          | Subagent                        | Teammate                           |
|--------------------------|---------------------------------|------------------------------------|
| Process kind             | Subprocess of parent Claude     | Independent Claude process         |
| Hook that fires          | `SubagentStart` / `SubagentStop`| `SessionStart` (with `agent_type`) |
| Own pty                  | No                              | Yes (tmux pane)                    |
| Interactive              | No                              | Yes (in principle)                 |
| `isSidechain` in jsonl   | `true`                          | `false`                            |
| Transcript path          | `<parent-sid>/subagents/agent-<aid>.jsonl` | `<teammate-sid>.jsonl`    |
| Cmdline flags            | N/A                             | `--parent-session-id`, `--team-name`, `--agent-name`, `--agent-color` |
| Session env              | Inherited from parent           | Fresh, includes `TMUX_PANE`        |

## Rehydration on IDE restart (deferred — not in v1)

Teammate tmux panes persist across IDE restarts because the user's tmux server is long-lived. The app does not currently rehydrate teammate windows on restart — stale canvas entries are cleaned up at launch.

To add this later:

1. Enumerate panes on the user's tmux socket: `tmux -S <socket> list-panes -a -F '#{pane_id} #{pane_pid}'`.
2. For each pane, read `/proc/<pid>/cmdline`. If it contains `--agent-name` / `--team-name` / `--parent-session-id`, it's a teammate.
3. Correlate `--parent-session-id` to a restored leader canvas window via the SessionStart map.
4. Reconstruct the teammate canvas window + edge, re-establish the pipe-pane stream.

Gotcha: the user's tmux socket path isn't known until we see it — either persist the last-known socket with the teammate window metadata or walk `/tmp/tmux-*/` at startup.

## Parent-session correlation

- **Subagent → parent:** `session_id` in the hook payload IS the parent session id.
- **Teammate → leader:** `--parent-session-id` in cmdline IS the leader's session id.

Both tie back to cc-ide's canvas window via the SessionStart-mapping side channel (`CC_IDE_WINDOW` env → session_id map built at leader spawn time).
