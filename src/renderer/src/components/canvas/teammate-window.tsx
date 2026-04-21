import { memo } from 'react'
import { TeammateXterm } from '@/components/terminal/teammate-xterm'
import { cn } from '@/lib/utils'
import { type CanvasWindow, useCanvas } from '@/state/canvas'
import { WindowFrame } from './window-frame'

// Map Claude's --agent-color (standard 8-color palette) to tailwind classes.
// Unknown colors fall back to a neutral dot.
const COLOR_DOT_CLASS: Record<string, string> = {
  black: 'bg-neutral-500',
  red: 'bg-red-400',
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  blue: 'bg-sky-400',
  magenta: 'bg-fuchsia-400',
  cyan: 'bg-cyan-400',
  white: 'bg-neutral-100',
}

const PILL_CLASS: Record<string, string> = {
  black: 'bg-neutral-500/20 text-neutral-300',
  red: 'bg-red-400/15 text-red-300',
  green: 'bg-emerald-400/15 text-emerald-300',
  yellow: 'bg-amber-400/15 text-amber-300',
  blue: 'bg-sky-400/15 text-sky-300',
  magenta: 'bg-fuchsia-400/15 text-fuchsia-300',
  cyan: 'bg-cyan-400/15 text-cyan-300',
  white: 'bg-neutral-100/20 text-neutral-200',
}

function colorDotClass(color: string | null | undefined): string {
  if (!color) return 'bg-muted-foreground'
  return COLOR_DOT_CLASS[color] ?? 'bg-muted-foreground'
}

function teamPillClass(color: string | null | undefined): string {
  if (!color) return 'bg-muted text-muted-foreground'
  return PILL_CLASS[color] ?? 'bg-muted text-muted-foreground'
}

function TeammateWindowImpl({ w }: { w: CanvasWindow }): JSX.Element {
  const removeWindow = useCanvas((s) => s.removeWindow)
  const meta = w.agentMeta as
    | (CanvasWindow['agentMeta'] & {
        // Teammate windows pack the tmux locator + team chrome onto agentMeta.
        // See use-agent-events.ts for the shape.
        tmuxSocket?: string | null
        tmuxPane?: string | null
        teamName?: string | null
        agentName?: string | null
        agentColor?: string | null
      })
    | undefined
  const socket = meta?.tmuxSocket ?? null
  const pane = meta?.tmuxPane ?? null
  const agentColor = meta?.agentColor ?? null
  const teamName = meta?.teamName ?? null
  const agentName = meta?.agentName ?? null

  const title = agentName && teamName ? `${agentName}@${teamName}` : w.title

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
      leadingIcon={
        <span
          className={cn('inline-block size-2.5 shrink-0 rounded-full', colorDotClass(agentColor))}
          aria-hidden
        />
      }
      titleSuffix={
        <span className="font-mono text-[10px] text-muted-foreground/80">(teammate)</span>
      }
      badge={
        <>
          {teamName ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                teamPillClass(agentColor),
              )}
            >
              {teamName}
            </span>
          ) : null}
          {w.exited ? (
            <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              closed
            </span>
          ) : null}
        </>
      }
    >
      {socket && pane ? (
        <TeammateXterm socket={socket} pane={pane} />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted-foreground">
          missing tmux pane — cannot attach
        </div>
      )}
    </WindowFrame>
  )
}

export const TeammateWindow = memo(TeammateWindowImpl)
