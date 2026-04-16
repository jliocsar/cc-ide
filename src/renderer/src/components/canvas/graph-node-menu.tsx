import { randomUUID } from '@/lib/uuid'
import { ExternalLink, Pin } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDrops } from '@/state/drops'
import { useDepGraph } from '@/state/depgraph'

interface Props {
  menu: { x: number; y: number; nodeId: string } | null
  workspaceId: string
  alreadyMarked: boolean
  onClose: () => void
}

export function GraphNodeMenu({
  menu,
  workspaceId,
  alreadyMarked,
  onClose,
}: Props): JSX.Element {
  const addDrop = useDrops((s) => s.add)
  const nodes = useDepGraph((s) => s.byWorkspace.get(workspaceId)?.nodes)

  const node = menu && nodes ? nodes.get(menu.nodeId) : null
  const isFile = node?.kind === 'file'

  function mark(): void {
    if (!menu || !isFile) return
    addDrop({
      id: randomUUID(),
      workspaceId,
      relPath: menu.nodeId,
      addedAt: Date.now(),
    })
    onClose()
  }

  return (
    <DropdownMenu
      open={menu !== null}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: menu?.x ?? 0,
            top: menu?.y ?? 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0}>
        <DropdownMenuItem
          onClick={mark}
          disabled={!isFile || alreadyMarked}
        >
          <ExternalLink />
          {alreadyMarked ? 'Marked for drop' : 'Mark for drop'}
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Pin />
          Pin node (soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
