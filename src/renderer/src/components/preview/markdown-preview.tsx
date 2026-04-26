import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { renderMarkdown } from '@/lib/markdown/setup'
import { useTabs } from '@/state/tabs'
import { PreviewSearch } from './preview-search'
import { useMermaidLazy } from './use-mermaid-lazy'

type Props = {
  workspaceId: string
  relPath: string
  content: string
}

export function MarkdownPreview({ workspaceId, relPath, content }: Props): JSX.Element {
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const out = await renderMarkdown(content)
        if (!cancelled) {
          setHtml(out)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false)
          toast.error('Markdown render failed', {
            description: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [content])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.innerHTML = html
  }, [html])

  useMermaidLazy(bodyRef, html)

  // Ctrl+F handler — only when this preview is mounted + visible
  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod || ev.shiftKey) return
      if (ev.key !== 'f' && ev.key !== 'F') return
      if (!containerRef.current?.isConnected) return
      ev.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // click delegation: copy buttons + internal .md links + http link safety
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    function onClick(ev: MouseEvent): void {
      const target = ev.target as HTMLElement | null
      if (!target) return
      const copyBtn = target.closest<HTMLElement>('.md-code-copy')
      if (copyBtn) {
        ev.preventDefault()
        const wrap = copyBtn.closest('.md-code')
        const code =
          wrap?.querySelector('code')?.textContent ?? wrap?.querySelector('pre')?.textContent ?? ''
        void navigator.clipboard.writeText(code).then(
          () => toast.success('Copied'),
          () => toast.error('Copy failed'),
        )
        return
      }
      const a = target.closest<HTMLAnchorElement>('a[data-internal-md]')
      if (a) {
        ev.preventDefault()
        const href = a.getAttribute('data-internal-md') ?? ''
        const resolved = resolveRelativeMd(relPath, href.split('#')[0] ?? '')
        useTabs.getState().openPlan(workspaceId, resolved)
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [relPath, workspaceId])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {searchOpen ? <PreviewSearch bodyRef={bodyRef} onClose={() => setSearchOpen(false)} /> : null}
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-background/80 font-mono text-xs text-muted-foreground">
          rendering preview…
        </div>
      ) : null}
      <ScrollArea className="h-full">
        <article ref={bodyRef} className="markdown-body" />
      </ScrollArea>
    </div>
  )
}

function resolveRelativeMd(currentRel: string, href: string): string {
  if (!href) return currentRel
  if (href.startsWith('/')) return href.replace(/^\/+/, '')
  const dir = currentRel.split('/').slice(0, -1)
  const parts = href.split('/')
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      dir.pop()
      continue
    }
    dir.push(p)
  }
  return dir.join('/')
}
