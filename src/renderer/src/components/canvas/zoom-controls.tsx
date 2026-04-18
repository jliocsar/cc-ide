import { Maximize2, Minus, Plus } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useCanvas } from '@/state/canvas'

interface Props {
  hostRef: React.RefObject<HTMLDivElement | null>
  zoomPercent: number
  onSpawn: () => void
  spawnDisabled: boolean
}

export function ZoomControls({
  hostRef,
  zoomPercent,
  onSpawn,
  spawnDisabled,
}: Props): JSX.Element {
  const zoomBy = useCallback(
    (factor: number) => {
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      useCanvas.getState().zoomAt(factor, rect.width / 2, rect.height / 2)
    },
    [hostRef],
  )

  const onZoomIn = useCallback(() => zoomBy(1.15), [zoomBy])
  const onZoomOut = useCallback(() => zoomBy(1 / 1.15), [zoomBy])
  const onReset = useCallback(() => useCanvas.getState().resetCamera(), [])

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow">
      <Button size="icon-xs" variant="ghost" onClick={onZoomOut} aria-label="Zoom out">
        <Minus />
      </Button>
      <span className="min-w-10 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
        {zoomPercent}%
      </span>
      <Button size="icon-xs" variant="ghost" onClick={onZoomIn} aria-label="Zoom in">
        <Plus />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={onReset} aria-label="Reset camera">
        <Maximize2 />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onSpawn}
        disabled={spawnDisabled}
        aria-label="Spawn Claude"
      >
        <Plus />
      </Button>
    </div>
  )
}
