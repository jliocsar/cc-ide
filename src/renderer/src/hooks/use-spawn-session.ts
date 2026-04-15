import { useCallback, useState } from 'react'
import { useCanvas, worldFromViewport } from '@/state/canvas'
import { useSessions } from '@/state/sessions'
import { useWorkspaces } from '@/state/workspaces'
import { getCanvasViewportCenter } from '@/lib/canvas-host'

const DEFAULT_WIN_W = 720
const DEFAULT_WIN_H = 440

export function useSpawnSession(): {
  spawn: (viewportPos?: { x: number; y: number }) => Promise<void>
  spawning: boolean
  error: string | null
} {
  const spawnSession = useSessions((s) => s.spawn)
  const addWindow = useCanvas((s) => s.addWindow)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const [spawning, setSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spawn = useCallback(
    async (viewportPos?: { x: number; y: number }) => {
      if (!activeWorkspaceId) {
        setError('Add a workspace first.')
        return
      }
      setSpawning(true)
      setError(null)
      try {
        const vp = viewportPos ?? getCanvasViewportCenter()
        const { ptyId, tmuxWindow } = await spawnSession(activeWorkspaceId, 120, 30)
        const { camera } = useCanvas.getState()
        const world = worldFromViewport(vp.x, vp.y, camera)
        addWindow({
          id: crypto.randomUUID(),
          sessionId: ptyId,
          tmuxWindow,
          title: tmuxWindow,
          x: world.x - DEFAULT_WIN_W / 2,
          y: world.y - DEFAULT_WIN_H / 2,
          width: DEFAULT_WIN_W,
          height: DEFAULT_WIN_H,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSpawning(false)
      }
    },
    [activeWorkspaceId, spawnSession, addWindow],
  )

  return { spawn, spawning, error }
}
