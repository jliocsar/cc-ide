import { ensureHighlighter, type LangId } from '@/lib/shiki'

const SHIKI_LANGS: ReadonlySet<string> = new Set([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'css',
  'html',
  'python',
  'go',
  'rust',
  'shell',
  'yaml',
  'toml',
])

const LANG_ALIAS: Record<string, LangId> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  css: 'css',
  html: 'html',
  py: 'python',
  python: 'python',
  go: 'go',
  rs: 'rust',
  rust: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  shellscript: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
}

export function normalizeLang(raw: string | undefined): LangId | null {
  if (!raw) return null
  const k = raw.toLowerCase().trim()
  return LANG_ALIAS[k] ?? null
}

const FENCE_RE = /^[ ]{0,3}(```|~~~)([^\n`]*)$/gm

export function extractFencedLangs(source: string): LangId[] {
  const out = new Set<LangId>()
  FENCE_RE.lastIndex = 0
  for (let m = FENCE_RE.exec(source); m; m = FENCE_RE.exec(source)) {
    const info = (m[2] ?? '').trim().split(/\s+/)[0]
    const lang = normalizeLang(info)
    if (lang && SHIKI_LANGS.has(lang)) out.add(lang)
  }
  return [...out]
}

export async function ensureLangsForSource(source: string): Promise<void> {
  const langs = extractFencedLangs(source)
  if (langs.length === 0) {
    await ensureHighlighter()
    return
  }
  const hl = await ensureHighlighter()
  const loaded = new Set(hl.getLoadedLanguages())
  await Promise.all(
    langs
      .filter((l) => !loaded.has(l))
      .map(async (l) => {
        const mod = await loaderFor(l)
        if (mod) await hl.loadLanguage(mod.default)
      }),
  )
}

async function loaderFor(lang: LangId) {
  switch (lang) {
    case 'typescript':
      return import('shiki/langs/typescript.mjs')
    case 'tsx':
      return import('shiki/langs/tsx.mjs')
    case 'javascript':
      return import('shiki/langs/javascript.mjs')
    case 'jsx':
      return import('shiki/langs/jsx.mjs')
    case 'json':
      return import('shiki/langs/json.mjs')
    case 'markdown':
      return import('shiki/langs/markdown.mjs')
    case 'css':
      return import('shiki/langs/css.mjs')
    case 'html':
      return import('shiki/langs/html.mjs')
    case 'python':
      return import('shiki/langs/python.mjs')
    case 'go':
      return import('shiki/langs/go.mjs')
    case 'rust':
      return import('shiki/langs/rust.mjs')
    case 'shell':
      return import('shiki/langs/shellscript.mjs')
    case 'yaml':
      return import('shiki/langs/yaml.mjs')
    case 'toml':
      return import('shiki/langs/toml.mjs')
    default:
      return null
  }
}
