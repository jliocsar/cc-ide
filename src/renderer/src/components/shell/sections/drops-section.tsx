import { File as FileIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { setDropPayload } from '@/lib/drop-payload'
import { selectDropsFor, useDrops } from '@/state/drops'

export function DropsSection({ workspaceId }: { workspaceId: string }): JSX.Element {
  const entries = useDrops(selectDropsFor(workspaceId))
  const remove = useDrops((s) => s.remove)

  if (entries.length === 0) {
    return (
      <div className="px-3 py-1 text-[11px] text-muted-foreground">
        right-click a graph node → “Mark for drop”.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-px">
      {entries.map((e) => {
        const parts = e.relPath.split('/')
        const name = parts[parts.length - 1] ?? e.relPath
        const dir = parts.slice(0, -1).join('/')
        return (
          <div
            key={e.id}
            draggable
            onDragStart={(ev) => {
              setDropPayload(ev.dataTransfer, {
                kind: 'file',
                workspaceId,
                relPath: e.relPath,
              })
            }}
            className="group flex items-center gap-2 px-3 py-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <FileIcon className="size-3 shrink-0" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[12px]">{name}</span>
                  {dir ? (
                    <span className="truncate font-mono text-[10px] opacity-60">{dir}</span>
                  ) : null}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{e.relPath}</TooltipContent>
            </Tooltip>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => remove(workspaceId, e.id)}
              aria-label="Remove drop"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
