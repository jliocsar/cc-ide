import { useEffect } from 'react'
import { attachPanZoom } from '@/lib/markdown/pan-zoom'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let initialized = false

async function getMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default)
  }
  const mermaid = await mermaidPromise
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      fontFamily: 'var(--font-mono)',
    })
    initialized = true
  }
  return mermaid
}

const idle = (cb: () => void): number => {
  type W = Window & { requestIdleCallback?: (fn: () => void) => number }
  const w = window as W
  if (w.requestIdleCallback) return w.requestIdleCallback(cb)
  return window.setTimeout(cb, 0)
}

export function useMermaidLazy(rootRef: React.RefObject<HTMLElement | null>, html: string): void {
  useEffect(() => {
    void html // re-run trigger
    const root = rootRef.current
    if (!root) return
    const hosts = root.querySelectorAll<HTMLElement>('.mermaid-host:not([data-rendered])')
    if (hosts.length === 0) return

    const cleanups: Array<() => void> = []
    let cancelled = false
    const queue = new Set<HTMLElement>()
    let renderingPromise: Promise<void> | null = null

    async function processQueue(): Promise<void> {
      const mermaid = await getMermaid()
      while (!cancelled && queue.size > 0) {
        const host = queue.values().next().value as HTMLElement | undefined
        if (!host) break
        queue.delete(host)
        if (host.dataset.rendered) continue
        const sourceEl = host.querySelector('.mermaid-source')
        const source = sourceEl?.textContent ?? ''
        const id = host.dataset.mermaidId ?? `mermaid-${Math.random().toString(36).slice(2, 10)}`
        try {
          const { svg, bindFunctions } = await mermaid.render(id, source)
          if (cancelled) return
          host.innerHTML = svg
          if (bindFunctions) bindFunctions(host)
          host.dataset.rendered = '1'
          const svgEl = host.querySelector<SVGSVGElement>('svg')
          if (svgEl) {
            const cleanup = attachPanZoom(host, svgEl)
            cleanups.push(cleanup)
          }
        } catch (err) {
          host.dataset.rendered = '1'
          host.dataset.state = 'error'
          const msg = err instanceof Error ? err.message : String(err)
          host.innerHTML = `<pre class="mermaid-source">${escapeHtml(`${msg}\n\n${source}`)}</pre>`
        }
        await new Promise<void>((r) => idle(r))
      }
    }

    function schedule(host: HTMLElement): void {
      queue.add(host)
      if (renderingPromise) return
      renderingPromise = processQueue().finally(() => {
        renderingPromise = null
      })
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            schedule(e.target as HTMLElement)
            observer.unobserve(e.target)
          }
        }
      },
      { root: null, rootMargin: '600px 0px', threshold: 0 },
    )

    for (const h of hosts) observer.observe(h)

    return () => {
      cancelled = true
      observer.disconnect()
      for (const c of cleanups) c()
    }
  }, [html, rootRef])
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
