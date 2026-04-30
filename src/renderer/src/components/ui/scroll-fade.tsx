import * as React from 'react'

import { cn } from '@/lib/utils'

type ScrollFadeProps = {
  className?: string
  innerClassName?: string
  fadeFrom?: 'card' | 'background' | 'popover'
  fadeSize?: number
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  style?: React.CSSProperties
  children: React.ReactNode
}

const FADE_TOKEN: Record<NonNullable<ScrollFadeProps['fadeFrom']>, string> = {
  card: 'var(--card)',
  background: 'var(--background)',
  popover: 'var(--popover)',
}

export const ScrollFade = React.forwardRef<HTMLDivElement, ScrollFadeProps>(function ScrollFade(
  { className, innerClassName, fadeFrom = 'card', fadeSize = 20, onScroll, style, children },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLDivElement, [])

  const [showTop, setShowTop] = React.useState(false)
  const [showBottom, setShowBottom] = React.useState(false)

  const recompute = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    setShowTop(scrollTop > 0)
    setShowBottom(scrollTop + clientHeight < scrollHeight - 1)
  }, [])

  React.useEffect(() => {
    const el = innerRef.current
    if (!el) return
    recompute()
    const ro = new ResizeObserver(() => recompute())
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [recompute])

  const fadeColor = FADE_TOKEN[fadeFrom]

  return (
    <div className={cn('relative min-h-0', className)} style={style}>
      <div
        ref={innerRef}
        onScroll={(e) => {
          recompute()
          onScroll?.(e)
        }}
        className={cn('size-full overflow-auto scrollbar-none', innerClassName)}
      >
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-150"
        style={{
          height: fadeSize,
          opacity: showTop ? 1 : 0,
          background: `linear-gradient(to bottom, ${fadeColor}, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-150"
        style={{
          height: fadeSize,
          opacity: showBottom ? 1 : 0,
          background: `linear-gradient(to top, ${fadeColor}, transparent)`,
        }}
      />
    </div>
  )
})
