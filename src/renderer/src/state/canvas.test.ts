import { describe, expect, it } from 'vitest'
import { computeCenterCamera } from './canvas'

describe('computeCenterCamera', () => {
  it('centers a window at viewport center with zoom=1', () => {
    const window = { x: 100, y: 200, width: 400, height: 300 }
    const viewportCenter = { x: 600, y: 400 }
    const cam = computeCenterCamera(window, viewportCenter, 1)
    expect(cam).toEqual({
      x: 600 - 300,
      y: 400 - 350,
      zoom: 1,
    })
  })

  it('accounts for zoom', () => {
    const window = { x: 0, y: 0, width: 200, height: 200 }
    const viewportCenter = { x: 500, y: 500 }
    const cam = computeCenterCamera(window, viewportCenter, 2)
    expect(cam).toEqual({ x: 500 - 200, y: 500 - 200, zoom: 2 })
  })

  it('handles a window at origin with negative camera result', () => {
    const window = { x: 1000, y: 1000, width: 100, height: 100 }
    const viewportCenter = { x: 500, y: 500 }
    const cam = computeCenterCamera(window, viewportCenter, 1)
    expect(cam.x).toBe(500 - 1050)
    expect(cam.y).toBe(500 - 1050)
  })

  it('passes zoom through unchanged', () => {
    const cam = computeCenterCamera({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0 }, 0.75)
    expect(cam.zoom).toBe(0.75)
  })
})
