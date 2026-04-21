import { EventEmitter } from 'node:events'
import type {
  AgentSubagentStartEvent,
  AgentSubagentStopEvent,
  AgentTeammateStartEvent,
} from '@shared/ipc'
import { broadcast } from '../event-bus'

// In-memory side-channel that correlates Claude `session_id`s to the cc-ide
// canvas windows that spawned them. Populated by the HTTP hook server (main)
// as SessionStart / SubagentStart / SubagentStop fire. Pure; no I/O.

// Node-side emitter so other main modules (subagent-tail) can react without
// going through the Electron BrowserWindow broadcast.
type AgentEventMap = {
  teammateStart: [AgentTeammateStartEvent]
  subagentStart: [AgentSubagentStartEvent & { cwdHint: string | null }]
  subagentStop: [AgentSubagentStopEvent]
}
export const agentEvents = new EventEmitter<AgentEventMap>()

export type TeammateInfo = {
  parentSessionId: string
  teamName?: string
  agentName?: string
  agentColor?: string
  agentType?: string
  tmuxSocket?: string
  tmuxPane?: string
}

export type SessionEntry = {
  sessionId: string
  ccIdeWindow?: string
  cwd?: string
  transcriptPath?: string
  teammate?: TeammateInfo
}

const sessionsBySessionId = new Map<string, SessionEntry>()

export function __clearForTests(): void {
  sessionsBySessionId.clear()
}

export function getSessionBySessionId(sessionId: string): SessionEntry | undefined {
  return sessionsBySessionId.get(sessionId)
}

export function getSessionByCcIdeWindow(ccIdeWindow: string): SessionEntry | undefined {
  for (const entry of sessionsBySessionId.values()) {
    if (entry.ccIdeWindow === ccIdeWindow) return entry
  }
  return undefined
}

export function extractTeammateInfoFromCmdline(cmdline: string): TeammateInfo | null {
  const parentSessionId = pickFlag(cmdline, '--parent-session-id')
  if (!parentSessionId) return null
  return {
    parentSessionId,
    teamName: pickFlag(cmdline, '--team-name'),
    agentName: pickFlag(cmdline, '--agent-name'),
    agentColor: pickFlag(cmdline, '--agent-color'),
    agentType: pickFlag(cmdline, '--agent-type'),
  }
}

// Supports both `--flag value` and `--flag=value` forms. Ignores values
// following a flag the loop already consumed.
function pickFlag(cmdline: string, flag: string): string | undefined {
  const tokens = cmdline.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t === flag) {
      const next = tokens[i + 1]
      if (next && !next.startsWith('--')) return next
      return undefined
    }
    if (t.startsWith(flag + '=')) return t.slice(flag.length + 1)
  }
  return undefined
}

export type SessionStartPayload = {
  session_id: string
  transcript_path?: string
  cwd?: string
  agent_type?: string
  cc_ide_window?: string
  tmux_pane?: string
  tmux_socket?: string
  ppid_cmdline?: string
}

export function onSessionStart(p: SessionStartPayload): SessionEntry {
  const existing = sessionsBySessionId.get(p.session_id)
  const teammate = p.ppid_cmdline ? extractTeammateInfoFromCmdline(p.ppid_cmdline) : null
  const entry: SessionEntry = {
    sessionId: p.session_id,
    ccIdeWindow: p.cc_ide_window || existing?.ccIdeWindow,
    cwd: p.cwd ?? existing?.cwd,
    transcriptPath: p.transcript_path ?? existing?.transcriptPath,
    teammate: teammate
      ? {
          ...teammate,
          tmuxSocket: p.tmux_socket || undefined,
          tmuxPane: p.tmux_pane || undefined,
        }
      : existing?.teammate,
  }
  sessionsBySessionId.set(p.session_id, entry)

  if (entry.teammate) {
    const parent = sessionsBySessionId.get(entry.teammate.parentSessionId)
    if (parent?.ccIdeWindow) {
      const ev: AgentTeammateStartEvent = {
        sessionId: entry.sessionId,
        parentSessionId: entry.teammate.parentSessionId,
        parentCcIdeWindow: parent.ccIdeWindow,
        teamName: entry.teammate.teamName ?? null,
        agentName: entry.teammate.agentName ?? null,
        agentColor: entry.teammate.agentColor ?? null,
        agentType: entry.teammate.agentType ?? null,
        tmuxSocket: entry.teammate.tmuxSocket ?? null,
        tmuxPane: entry.teammate.tmuxPane ?? null,
        cwd: entry.cwd ?? null,
        transcriptPath: entry.transcriptPath ?? null,
      }
      broadcast('agent:teammateStart', ev)
      agentEvents.emit('teammateStart', ev)
    }
  }
  return entry
}

export type SubagentPayload = {
  session_id: string
  cwd?: string
  agent_id: string
  agent_type?: string
  teammate_name?: string | null
  transcript_path?: string
  agent_transcript_path?: string
  last_assistant_message?: string
}

function isIdeOwned(entry: SessionEntry | undefined): boolean {
  if (!entry) return false
  return Boolean(entry.ccIdeWindow || entry.teammate?.parentSessionId)
}

export function onSubagentStart(p: SubagentPayload): void {
  const parent = sessionsBySessionId.get(p.session_id)
  if (!isIdeOwned(parent)) return
  const ev: AgentSubagentStartEvent = {
    parentSessionId: p.session_id,
    parentCcIdeWindow: parent!.ccIdeWindow ?? null,
    agentId: p.agent_id,
    agentType: p.agent_type ?? null,
    teammateName: p.teammate_name ?? null,
    cwd: p.cwd ?? null,
  }
  broadcast('agent:subagentStart', ev)
  // The tail module needs a cwd to locate the transcript; fall back to the
  // parent session's cwd when the subagent payload omits it.
  agentEvents.emit('subagentStart', { ...ev, cwdHint: ev.cwd ?? parent?.cwd ?? null })
}

export function onSubagentStop(p: SubagentPayload): void {
  const parent = sessionsBySessionId.get(p.session_id)
  if (!isIdeOwned(parent)) return
  const ev: AgentSubagentStopEvent = {
    parentSessionId: p.session_id,
    agentId: p.agent_id,
    agentTranscriptPath: p.agent_transcript_path ?? null,
    lastAssistantMessage: p.last_assistant_message ?? null,
  }
  broadcast('agent:subagentStop', ev)
  agentEvents.emit('subagentStop', ev)
}
