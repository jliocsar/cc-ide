import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_MATCHES = 1000
const DEBOUNCE_MS = 150

type CssHighlightCtor = new (...ranges: Range[]) => { clear(): void }
type CssHighlightRegistry = Map<string, InstanceType<CssHighlightCtor>>
type CssHl = { Highlight: CssHighlightCtor; highlights: CssHighlightRegistry }

function getCssHl(): CssHl | null {
  const w = window as unknown as {
    Highlight?: CssHighlightCtor
    CSS?: { highlights?: CssHighlightRegistry }
  }
  if (!w.Highlight || !w.CSS?.highlights) return null
  return { Highlight: w.Highlight, highlights: w.CSS.highlights }
}

function findRanges(root: HTMLElement, needle: string): Range[] {
  if (!needle) return []
  const lower = needle.toLowerCase()
  const out: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // skip mermaid source + script-style content
      if (parent.closest('.mermaid-source')) return NodeFilter.FILTER_REJECT
      if (!node.textContent || node.textContent.length === 0) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    const lowerText = text.toLowerCase()
    let from = 0
    while (from <= lowerText.length - needle.length) {
      const i = lowerText.indexOf(lower, from)
      if (i < 0) break
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + needle.length)
      out.push(r)
      if (out.length >= MAX_MATCHES) return out
      from = i + needle.length
    }
  }
  return out
}

export function PreviewSearch({
  bodyRef,
  onClose,
}: {
  bodyRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}): JSX.Element {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Range[]>([])
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [input])

  useEffect(() => {
    const root = bodyRef.current
    const css = getCssHl()
    if (!root || !css) {
      setMatches([])
      return
    }
    if (!query) {
      css.highlights.delete('md-search-match')
      css.highlights.delete('md-search-current')
      setMatches([])
      setCurrent(0)
      return
    }
    const ranges = findRanges(root, query)
    setMatches(ranges)
    setCurrent(0)
    if (ranges.length === 0) {
      css.highlights.delete('md-search-match')
      css.highlights.delete('md-search-current')
      return
    }
    const first = ranges[0]
    css.highlights.set('md-search-match', new css.Highlight(...ranges))
    if (first) {
      css.highlights.set('md-search-current', new css.Highlight(first))
      scrollIntoView(first)
    }
    return () => {
      css.highlights.delete('md-search-match')
      css.highlights.delete('md-search-current')
    }
  }, [query, bodyRef])

  useEffect(() => {
    const css = getCssHl()
    if (!css || matches.length === 0) return
    const r = matches[current]
    if (!r) return
    css.highlights.set('md-search-current', new css.Highlight(r))
    scrollIntoView(r)
  }, [current, matches])

  function next(): void {
    if (matches.length === 0) return
    setCurrent((c) => (c + 1) % matches.length)
  }
  function prev(): void {
    if (matches.length === 0) return
    setCurrent((c) => (c - 1 + matches.length) % matches.length)
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const countLabel =
    matches.length === 0
      ? query
        ? '0/0'
        : ''
      : `${current + 1}/${matches.length}${matches.length >= MAX_MATCHES ? '+' : ''}`

  return (
    <div
      className={cn(
        'absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border bg-popover px-1.5 py-1 shadow-md',
      )}
    >
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        placeholder="Find in preview"
        className="h-6 w-44 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground"
      />
      <span className="min-w-12 text-right font-mono text-[10px] text-muted-foreground">
        {countLabel}
      </span>
      <Button size="icon-xs" variant="ghost" onClick={prev} aria-label="Previous match">
        <ChevronUp />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={next} aria-label="Next match">
        <ChevronDown />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close search">
        <X />
      </Button>
    </div>
  )
}

function scrollIntoView(range: Range): void {
  const el = range.startContainer.parentElement
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
