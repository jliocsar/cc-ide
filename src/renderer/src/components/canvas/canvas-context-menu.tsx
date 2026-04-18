import { Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ContextMenuState {
  x: number
  y: number
  vp: { x: number; y: number }
}

interface Props {
  menu: ContextMenuState | null
  canSpawn: boolean
  spawnDisabled: boolean
  onClose: () => void
  onSpawn: (vp: { x: number; y: number }) => void
}

export function CanvasContextMenu({
  menu,
  canSpawn,
  spawnDisabled,
  onClose,
  onSpawn,
}: Props): JSX.Element {
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
          disabled={!canSpawn || spawnDisabled}
          onClick={() => {
            if (!menu) return
            onSpawn(menu.vp)
            onClose()
          }}
        >
          <Plus />
          New session
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
