import { useEffect, useState } from 'react'

// Built-in fonts ship with the app via @theme inline in globals.css. Selecting
// one of these keys uses the corresponding CSS variable. Any other value is
// either the legacy 'system' sentinel or an arbitrary system family name.
export const BUILTIN_FONTS = {
  geist: { label: 'Geist', cssVar: 'var(--font-sans)', kind: 'sans' as const },
  'geist-mono': { label: 'Geist Mono', cssVar: 'var(--font-mono)', kind: 'mono' as const },
  'space-grotesk': {
    label: 'Space Grotesk',
    cssVar: 'var(--font-condensed)',
    kind: 'sans' as const,
  },
} as const
export type BuiltinFontKey = keyof typeof BUILTIN_FONTS

export function isBuiltinFont(value: string): value is BuiltinFontKey {
  return value in BUILTIN_FONTS
}

const SYSTEM_MONO_CHAIN = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const SYSTEM_SANS_CHAIN = 'ui-sans-serif, system-ui, -apple-system, sans-serif'

// Wraps a family name with quotes if it contains whitespace or special chars.
function quoteFamily(name: string): string {
  if (/^[a-zA-Z0-9\-_]+$/.test(name)) return name
  return `'${name.replace(/'/g, "\\'")}'`
}

// Build a CSS font-family value from a primary value plus optional fallback.
// `kind` controls the trailing generic chain ('mono' for terminal/diff, 'sans'
// for editor when the user picks a non-mono).
export function resolveFontFamily(
  primary: string,
  fallback: string | null = null,
  kind: 'mono' | 'sans' = 'mono',
): string {
  const tail = kind === 'mono' ? SYSTEM_MONO_CHAIN : SYSTEM_SANS_CHAIN
  const parts: string[] = []
  const push = (value: string): void => {
    if (isBuiltinFont(value)) {
      parts.push(BUILTIN_FONTS[value].cssVar)
    } else if (value === 'system') {
      // legacy sentinel — emit nothing here; tail covers it
    } else {
      parts.push(quoteFamily(value))
    }
  }
  push(primary)
  if (fallback) push(fallback)
  parts.push(tail)
  return parts.join(', ')
}

// Display label for a font value (built-in label, 'System' for legacy sentinel,
// or the family name itself).
export function fontLabel(value: string): string {
  if (isBuiltinFont(value)) return BUILTIN_FONTS[value].label
  if (value === 'system') return 'System default'
  return value
}

type FontDataLike = { family: string }

let cachedFonts: string[] | null = null
let inflight: Promise<string[]> | null = null

async function loadFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts
  if (inflight) return inflight
  const w = window as unknown as { queryLocalFonts?: () => Promise<FontDataLike[]> }
  if (typeof w.queryLocalFonts !== 'function') {
    cachedFonts = []
    return cachedFonts
  }
  inflight = w
    .queryLocalFonts()
    .then((list) => {
      const seen = new Set<string>()
      for (const fd of list) {
        if (fd.family) seen.add(fd.family)
      }
      const sorted = Array.from(seen).sort((a, b) => a.localeCompare(b))
      cachedFonts = sorted
      inflight = null
      return sorted
    })
    .catch((err) => {
      console.error('[system-fonts] queryLocalFonts failed:', err)
      cachedFonts = []
      inflight = null
      return cachedFonts
    })
  return inflight
}

export function useSystemFonts(): { fonts: string[]; loading: boolean } {
  const [fonts, setFonts] = useState<string[]>(cachedFonts ?? [])
  const [loading, setLoading] = useState(cachedFonts === null)
  useEffect(() => {
    let cancelled = false
    if (cachedFonts !== null) {
      setFonts(cachedFonts)
      setLoading(false)
      return
    }
    void loadFonts().then((list) => {
      if (cancelled) return
      setFonts(list)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return { fonts, loading }
}
