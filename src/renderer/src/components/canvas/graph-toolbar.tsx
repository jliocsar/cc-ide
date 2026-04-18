import { Maximize2, Minus, Plus, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'

interface Props {
  workspaceId: string
  hostRef: React.RefObject<HTMLDivElement | null>
  zoomAt: (factor: number, vx: number, vy: number) => void
  onFitToGraph: () => void
}

export function GraphToolbar({ workspaceId, hostRef, zoomAt, onFitToGraph }: Props): JSX.Element {
  const zoomBy = useCallback(
    (factor: number) => {
      const host = hostRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      zoomAt(factor, rect.width / 2, rect.height / 2)
    },
    [hostRef, zoomAt],
  )
  const onZoomIn = useCallback(() => zoomBy(1.15), [zoomBy])
  const onZoomOut = useCallback(() => zoomBy(1 / 1.15), [zoomBy])
  const onRescan = useCallback(() => invoke('graph:refresh', { workspaceId }), [workspaceId])

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow">
      <Button size="icon-xs" variant="ghost" onClick={onZoomOut} aria-label="Zoom out">
        <Minus />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={onZoomIn} aria-label="Zoom in">
        <Plus />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={onFitToGraph} aria-label="Fit to graph">
        <Maximize2 />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button size="icon-xs" variant="ghost" onClick={onRescan} aria-label="Rescan">
        <RefreshCw />
      </Button>
    </div>
  )
}
