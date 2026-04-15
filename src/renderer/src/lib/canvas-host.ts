let host: HTMLDivElement | null = null

export function setCanvasHost(el: HTMLDivElement | null): void {
  host = el
}

export function getCanvasViewportCenter(): { x: number; y: number } {
  if (!host) return { x: 600, y: 400 }
  const r = host.getBoundingClientRect()
  return { x: r.width / 2, y: r.height / 2 }
}
