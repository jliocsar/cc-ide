import { cn } from '@/lib/utils'

export function VerticalResizer({
  side,
  width,
  onWidth,
  onResizeStart,
  onResizeEnd,
  onReset,
  className,
}: {
  side: 'left' | 'right'
  width: number
  onWidth: (w: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  onReset: () => void
  className?: string
}): JSX.Element {
  function onPointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    onResizeStart?.()
    function onMove(ev: PointerEvent): void {
      const dx = ev.clientX - startX
      onWidth(side === 'right' ? startW + dx : startW - dx)
    }
    function onUp(): void {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onResizeEnd?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className={cn(
        'relative z-20 -mx-1 h-full w-2 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/20',
        className,
      )}
    />
  )
}
