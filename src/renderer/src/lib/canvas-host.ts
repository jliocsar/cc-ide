let host: HTMLDivElement | null = null

export function setCanvasHost(el: HTMLDivElement | null): void {
  host = el
}

export function getCanvasViewportCenter(): { x: number; y: number } {
  if (!host) return { x: 600, y: 400 }
  const r = host.getBoundingClientRect()
  return { x: r.width / 2, y: r.height / 2 }
}

export function getCanvasHost(): HTMLDivElement | null {
  return host
}

export function clientToCanvasViewport(
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!host) return null
  const r = host.getBoundingClientRect()
  return { x: clientX - r.left, y: clientY - r.top }
}
