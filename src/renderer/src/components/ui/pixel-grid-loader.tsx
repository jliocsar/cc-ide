import { useEffect, useRef } from 'react'
// @ts-expect-error -- 3px-grid ships UMD without types
import PixelGrid from '3px-grid'

type PixelGridConfig = {
  animation: {
    name: string
    delays: number[]
    duration: number
    color?: string
  }
}

type PixelGridInstance = {
  destroy: () => void
}

const DEFAULT_CONFIG: PixelGridConfig = {
  animation: {
    name: 'spiral-cw',
    delays: [0, 80, 160, 560, 640, 240, 480, 400, 320],
    duration: 180,
    color: 'orange',
  },
}

export function PixelGridLoader({
  config = DEFAULT_CONFIG,
  className,
}: {
  config?: PixelGridConfig
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const instance = PixelGrid.create(ref.current, config) as PixelGridInstance
    return () => instance.destroy()
  }, [config])

  return <div ref={ref} className={`pixel-grid ${className ?? ''}`} aria-label="Loading" />
}
