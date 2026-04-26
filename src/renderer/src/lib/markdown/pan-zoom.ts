type PanState = {
  scale: number
  tx: number
  ty: number
  dragging: boolean
  startX: number
  startY: number
  startTx: number
  startTy: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 10

export function attachPanZoom(host: HTMLElement, svg: SVGSVGElement): () => void {
  const state: PanState = {
    scale: 1,
    tx: 0,
    ty: 0,
    dragging: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
  }

  function apply(): void {
    svg.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`
    svg.style.transformOrigin = '0 0'
  }
  apply()

  function onWheel(ev: WheelEvent): void {
    if (!ev.ctrlKey && !ev.metaKey) return
    ev.preventDefault()
    ev.stopPropagation()
    const rect = svg.getBoundingClientRect()
    const cx = ev.clientX - rect.left
    const cy = ev.clientY - rect.top
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor))
    const k = next / state.scale
    state.tx = cx - (cx - state.tx) * k
    state.ty = cy - (cy - state.ty) * k
    state.scale = next
    apply()
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return
    state.dragging = true
    state.startX = ev.clientX
    state.startY = ev.clientY
    state.startTx = state.tx
    state.startTy = state.ty
    svg.setPointerCapture(ev.pointerId)
    svg.style.cursor = 'grabbing'
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!state.dragging) return
    state.tx = state.startTx + (ev.clientX - state.startX)
    state.ty = state.startTy + (ev.clientY - state.startY)
    apply()
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!state.dragging) return
    state.dragging = false
    svg.releasePointerCapture(ev.pointerId)
    svg.style.cursor = 'grab'
  }

  function reset(): void {
    state.scale = 1
    state.tx = 0
    state.ty = 0
    apply()
  }

  function zoomBy(factor: number): void {
    const rect = svg.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor))
    const k = next / state.scale
    state.tx = cx - (cx - state.tx) * k
    state.ty = cy - (cy - state.ty) * k
    state.scale = next
    apply()
  }

  const controls = document.createElement('div')
  controls.className = 'mermaid-controls'
  controls.innerHTML = `
    <button type="button" data-act="in" aria-label="Zoom in">+</button>
    <button type="button" data-act="out" aria-label="Zoom out">−</button>
    <button type="button" data-act="reset" aria-label="Reset">⟳</button>
  `
  function onControlClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null
    const act = target?.dataset.act
    if (act === 'in') zoomBy(1.25)
    else if (act === 'out') zoomBy(1 / 1.25)
    else if (act === 'reset') reset()
  }
  controls.addEventListener('click', onControlClick)
  host.appendChild(controls)

  svg.style.cursor = 'grab'
  svg.addEventListener('wheel', onWheel, { passive: false })
  svg.addEventListener('pointerdown', onPointerDown)
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerUp)
  svg.addEventListener('pointercancel', onPointerUp)

  return () => {
    svg.removeEventListener('wheel', onWheel)
    svg.removeEventListener('pointerdown', onPointerDown)
    svg.removeEventListener('pointermove', onPointerMove)
    svg.removeEventListener('pointerup', onPointerUp)
    svg.removeEventListener('pointercancel', onPointerUp)
    controls.removeEventListener('click', onControlClick)
    controls.remove()
  }
}
