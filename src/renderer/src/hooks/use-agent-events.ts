import type {
  AgentSubagentStartEvent,
  AgentSubagentStopEvent,
  AgentSubagentTranscriptLineEvent,
  AgentTeammateStartEvent,
} from '@shared/ipc'
import { useEffect } from 'react'
import { onEvent } from '@/lib/ipc'
import { useCanvas } from '@/state/canvas'
import { useSubagentTranscripts } from '@/state/subagent-transcripts'

// Lookup key for correlating main-process agent events back to a canvas
// window we spawned locally for that subagent/teammate.
function subagentKey(parentSessionId: string, agentId: string): string {
  return `subagent::${parentSessionId}::${agentId}`
}
function teammateKey(sessionId: string): string {
  return `teammate::${sessionId}`
}

function findParentWindow(parentCcIdeWindow: string | null): string | null {
  if (!parentCcIdeWindow) return null
  const { windows } = useCanvas.getState()
  // tmuxWindow is stored as `ccide-<hash>:claude-<name>` in the canvas; the
  // CC_IDE_WINDOW env injected at spawn is just the tail (`claude-<name>`).
  // Match by tail.
  const match = windows.find((w) => {
    const tail = w.tmuxWindow.split(':').slice(1).join(':') || w.tmuxWindow
    return tail === parentCcIdeWindow
  })
  return match?.id ?? null
}

function nextChildPosition(parentId: string): { x: number; y: number } {
  const { windows } = useCanvas.getState()
  const parent = windows.find((w) => w.id === parentId)
  if (!parent) return { x: 240, y: 120 }
  const siblings = windows.filter(
    (w) => w.parentWindowId === parentId && (w.kind ?? 'claude') !== 'claude',
  )
  return {
    x: parent.x + parent.width + 40,
    y: parent.y + siblings.length * 40,
  }
}

function handleSubagentStart(ev: AgentSubagentStartEvent): void {
  const parentWindowId = findParentWindow(ev.parentCcIdeWindow)
  if (!parentWindowId) return
  const canvas = useCanvas.getState()
  const existingId = subagentKey(ev.parentSessionId, ev.agentId)
  // Dedupe on retry.
  if (canvas.windows.some((w) => w.id === existingId)) return
  const pos = nextChildPosition(parentWindowId)
  canvas.addWindow({
    id: existingId,
    kind: 'subagent',
    tmuxWindow: '',
    sessionId: null,
    title: `${ev.agentType ?? 'subagent'}:${ev.agentId.slice(0, 8)}`,
    x: pos.x,
    y: pos.y,
    width: 480,
    height: 320,
    parentWindowId,
    agentMeta: {
      parentSessionId: ev.parentSessionId,
      agentId: ev.agentId,
      agentType: ev.agentType,
      teammateName: ev.teammateName,
    },
  })
  canvas.addEdge({
    id: `edge::${existingId}`,
    fromWindowId: parentWindowId,
    toWindowId: existingId,
    kind: 'subagent',
    state: 'active',
  })
}

function handleSubagentStop(ev: AgentSubagentStopEvent): void {
  const id = subagentKey(ev.parentSessionId, ev.agentId)
  const { windows, markWindowExited } = useCanvas.getState()
  if (!windows.some((w) => w.id === id)) return
  markWindowExited(id, {
    agentTranscriptPath: ev.agentTranscriptPath,
    lastAssistantMessage: ev.lastAssistantMessage,
  })
}

function handleTranscriptLine(ev: AgentSubagentTranscriptLineEvent): void {
  const id = subagentKey(ev.parentSessionId, ev.agentId)
  useSubagentTranscripts.getState().append(id, ev.entries)
}

function handleTeammateStart(ev: AgentTeammateStartEvent): void {
  if (!ev.tmuxSocket || !ev.tmuxPane) return
  const parentWindowId = findParentWindow(ev.parentCcIdeWindow)
  if (!parentWindowId) return
  const canvas = useCanvas.getState()
  const id = teammateKey(ev.sessionId)
  if (canvas.windows.some((w) => w.id === id)) return
  const pos = nextChildPosition(parentWindowId)
  canvas.addWindow({
    id,
    kind: 'teammate',
    tmuxWindow: '',
    sessionId: null,
    title: ev.agentName && ev.teamName ? `${ev.agentName}@${ev.teamName}` : id,
    x: pos.x,
    y: pos.y,
    width: 640,
    height: 400,
    parentWindowId,
    agentMeta: {
      parentSessionId: ev.parentSessionId,
      agentId: ev.sessionId, // teammate has its own session_id
      agentType: ev.agentType,
      teamName: ev.teamName,
      agentName: ev.agentName,
      agentColor: ev.agentColor,
      tmuxSocket: ev.tmuxSocket,
      tmuxPane: ev.tmuxPane,
    },
  })
  canvas.addEdge({
    id: `edge::${id}`,
    fromWindowId: parentWindowId,
    toWindowId: id,
    kind: 'teammate',
    state: 'active',
  })
}

export function useAgentEvents(): void {
  useEffect(() => {
    const offStart = onEvent('agent:subagentStart', handleSubagentStart)
    const offStop = onEvent('agent:subagentStop', handleSubagentStop)
    const offLine = onEvent('agent:subagentTranscriptLine', handleTranscriptLine)
    const offTeam = onEvent('agent:teammateStart', handleTeammateStart)
    return () => {
      offStart()
      offStop()
      offLine()
      offTeam()
    }
  }, [])
}
