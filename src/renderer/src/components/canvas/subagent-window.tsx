import type { TranscriptEntry } from '@shared/ipc'
import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { type CanvasWindow, useCanvas } from '@/state/canvas'
import { useSubagentTranscripts } from '@/state/subagent-transcripts'
import { WindowFrame } from './window-frame'

// Colors for tool names — hash-to-palette. Keyed on tool name so the same
// tool gets a stable color across renders. Palette uses shadcn-compatible
// CSS vars via direct tailwind color references (chart-* tokens are dark-mode
// safe; for v1 we hardcode a small fixed palette to avoid theme plumbing).
const TOOL_COLORS = [
  'text-emerald-400',
  'text-sky-400',
  'text-amber-400',
  'text-violet-400',
  'text-rose-400',
  'text-teal-400',
  'text-lime-400',
  'text-indigo-400',
] as const

function toolColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return TOOL_COLORS[Math.abs(h) % TOOL_COLORS.length]!
}

function formatTime(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function shortInput(input: unknown): string {
  if (input === null || input === undefined) return ''
  if (typeof input === 'string') return input
  if (typeof input === 'object') {
    const rec = input as Record<string, unknown>
    // Common Claude tool-use inputs we want to show prominently.
    if (typeof rec['command'] === 'string') return rec['command'] as string
    if (typeof rec['file_path'] === 'string') return rec['file_path'] as string
    if (typeof rec['pattern'] === 'string') return rec['pattern'] as string
    if (typeof rec['path'] === 'string') return rec['path'] as string
    if (typeof rec['url'] === 'string') return rec['url'] as string
    try {
      return JSON.stringify(input)
    } catch {
      return '[object]'
    }
  }
  return String(input)
}

type PairedEntry =
  | { kind: 'assistant-text'; uuid: string; ts: number; text: string }
  | { kind: 'user-text'; uuid: string; ts: number; text: string }
  | {
      kind: 'tool'
      uuid: string
      ts: number
      toolName: string
      toolUseId: string
      input: unknown
      result: { text: string; isError: boolean } | null
    }

function pairEntries(entries: readonly TranscriptEntry[]): PairedEntry[] {
  const resultsById = new Map<string, { text: string; isError: boolean }>()
  for (const e of entries) {
    if (e.kind === 'tool-result') {
      resultsById.set(e.toolUseId, { text: e.text, isError: e.isError })
    }
  }
  const out: PairedEntry[] = []
  for (const e of entries) {
    if (e.kind === 'tool-use') {
      out.push({
        kind: 'tool',
        uuid: e.uuid,
        ts: e.ts,
        toolName: e.toolName,
        toolUseId: e.toolUseId,
        input: e.toolInput,
        result: resultsById.get(e.toolUseId) ?? null,
      })
    } else if (e.kind === 'tool-result') {
      // Skip; paired above.
    } else if (e.kind === 'assistant-text') {
      out.push({ kind: 'assistant-text', uuid: e.uuid, ts: e.ts, text: e.text })
    } else {
      out.push({ kind: 'user-text', uuid: e.uuid, ts: e.ts, text: e.text })
    }
  }
  return out
}

function SubagentWindowImpl({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const entries = useSubagentTranscripts(
    (s) => s.byWindow[w.id] ?? s.byWindow[`__missing__${w.id}`],
  )
  const paired = useMemo(() => pairEntries(entries ?? []), [entries])
  const agent = w.agentMeta
  const title = agent ? `${agent.agentType ?? 'subagent'}:${agent.agentId.slice(0, 8)}` : w.title

  return (
    <WindowFrame
      id={w.id}
      title={title}
      x={w.x}
      y={w.y}
      width={w.width}
      height={w.height}
      zIndex={w.zIndex}
      onClose={() => removeWindow(w.id)}
      badge={
        <>
          {w.exited ? (
            <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              done
            </span>
          ) : (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
              ● running
            </span>
          )}
          {agent?.teammateName ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              via {agent.teammateName}
            </span>
          ) : null}
        </>
      }
    >
      <div className="h-full overflow-y-auto bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] leading-relaxed">
        {paired.length === 0 ? (
          <div className="text-muted-foreground">waiting for output…</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {paired.map((entry) => (
              <li key={entry.uuid} className="flex flex-col gap-0.5">
                {renderEntry(entry)}
              </li>
            ))}
          </ul>
        )}
        {w.exited && agent?.lastAssistantMessage ? (
          <div className="mt-3 border-t border-border pt-2 text-muted-foreground">
            <span className="mr-2 text-[10px] uppercase tracking-wide">final</span>
            <span className="whitespace-pre-wrap">{agent.lastAssistantMessage}</span>
          </div>
        ) : null}
      </div>
    </WindowFrame>
  )
}

function renderEntry(entry: PairedEntry): JSX.Element {
  const time = formatTime(entry.ts)
  if (entry.kind === 'tool') {
    const hasError = entry.result?.isError === true
    return (
      <>
        <div className="flex items-baseline gap-2">
          <span className={cn('font-semibold', toolColor(entry.toolName))}>{entry.toolName}</span>
          <span className="ml-auto text-muted-foreground/60">{time}</span>
        </div>
        <div className="truncate text-muted-foreground">
          <span className="select-none text-muted-foreground/50">› </span>
          {shortInput(entry.input)}
        </div>
        {entry.result ? (
          <pre
            className={cn(
              'mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-background/60 px-2 py-1 text-[10.5px] text-muted-foreground',
              hasError && 'border-destructive/60 text-destructive',
            )}
          >
            {entry.result.text.slice(0, 2000)}
          </pre>
        ) : null}
      </>
    )
  }
  if (entry.kind === 'assistant-text') {
    return (
      <>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-foreground">assistant</span>
          <span className="ml-auto text-muted-foreground/60">{time}</span>
        </div>
        <div className="whitespace-pre-wrap text-foreground/90">{entry.text}</div>
      </>
    )
  }
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-muted-foreground">user</span>
        <span className="ml-auto text-muted-foreground/60">{time}</span>
      </div>
      <div className="whitespace-pre-wrap text-muted-foreground">{entry.text}</div>
    </>
  )
}

export const SubagentWindow = memo(SubagentWindowImpl)
