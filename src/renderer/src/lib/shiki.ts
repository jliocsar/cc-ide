import { createHighlighterCore, type HighlighterCore, type ThemedToken } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

export const THEME = 'vesper'

// Extend this list: add import + entry to LANG_LOADERS + entry to EXT_TO_LANG.
const LANG_LOADERS = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
} as const
export type LangId = keyof typeof LANG_LOADERS | 'plaintext'

const EXT_TO_LANG: Record<string, LangId> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  html: 'html',
  htm: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
}

const BASENAME_TO_LANG: Record<string, LangId> = {
  Dockerfile: 'shell',
  '.env': 'shell',
  '.gitignore': 'shell',
  '.dockerignore': 'shell',
  '.npmignore': 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
}

export function guessLang(path: string): LangId {
  const base = path.split('/').pop() ?? path
  if (BASENAME_TO_LANG[base]) return BASENAME_TO_LANG[base]
  const dot = base.lastIndexOf('.')
  if (dot < 0) return 'plaintext'
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

const PREWARMED: LangId[] = ['typescript', 'tsx', 'javascript', 'json', 'markdown']
let highlighterPromise: Promise<HighlighterCore> | null = null

export function ensureHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/vesper.mjs')],
      langs: PREWARMED.map((l) => LANG_LOADERS[l as keyof typeof LANG_LOADERS]()),
      engine: createOnigurumaEngine(import('shiki/wasm')),
    })
  }
  return highlighterPromise
}

const loadedLangs = new Set<LangId>(PREWARMED)
const langLoadPromises = new Map<LangId, Promise<void>>()

async function ensureLang(hl: HighlighterCore, lang: LangId): Promise<void> {
  if (lang === 'plaintext') return
  if (loadedLangs.has(lang)) return
  let p = langLoadPromises.get(lang)
  if (!p) {
    p = (async () => {
      const loader = LANG_LOADERS[lang as keyof typeof LANG_LOADERS]
      if (!loader) return
      const mod = await loader()
      await hl.loadLanguage(mod.default)
      loadedLangs.add(lang)
    })()
    langLoadPromises.set(lang, p)
  }
  await p
}

/**
 * Tokenize `code` into an array of lines; each line is an array of { content, color }.
 * Plaintext returns single-token lines with no color so callers render as-is.
 */
export async function tokenizeLines(code: string, lang: LangId): Promise<ThemedToken[][]> {
  const hl = await ensureHighlighter()
  if (lang === 'plaintext') {
    return code.split('\n').map((line) => [
      { content: line, color: undefined as unknown as string, offset: 0 },
    ])
  }
  await ensureLang(hl, lang)
  return hl.codeToTokens(code, { lang, theme: THEME }).tokens
}
