import Shiki from '@shikijs/markdown-it'
import MarkdownIt from 'markdown-it'
import frontMatter from 'markdown-it-front-matter'
import alerts from 'markdown-it-github-alerts'
import taskLists from 'markdown-it-task-lists'
import { ensureHighlighter, THEME } from '@/lib/shiki'
import { ensureLangsForSource } from './highlight'
import { mermaidPlugin } from './mermaid-plugin'

let mdPromise: Promise<MarkdownIt> | null = null

async function buildMd(): Promise<MarkdownIt> {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks: false,
  })

  const highlighter = await ensureHighlighter()
  md.use(
    (await Shiki({
      themes: { light: THEME, dark: THEME },
      highlighter: highlighter as never,
    })) as never,
  )

  md.use(alerts as never)
  md.use(taskLists as never, { enabled: false })
  md.use(frontMatter as never, () => {
    /* strip silently */
  })
  md.use(mermaidPlugin)

  const defaultLink =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const t = tokens[idx]
    if (t) {
      const href = t.attrGet('href') ?? ''
      if (/^https?:\/\//i.test(href)) {
        t.attrSet('target', '_blank')
        t.attrSet('rel', 'noopener noreferrer')
      } else if (/\.md(#.*)?$/i.test(href)) {
        t.attrSet('data-internal-md', href)
      }
    }
    return defaultLink(tokens, idx, options, env, self)
  }

  const defaultTable =
    md.renderer.rules.table_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    return `<div class="md-table-wrap">${defaultTable(tokens, idx, options, env, self)}`
  }
  const defaultTableClose =
    md.renderer.rules.table_close ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    return `${defaultTableClose(tokens, idx, options, env, self)}</div>`
  }

  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (!token) return ''
    const info = (token.info ?? '').trim()
    if (info.toLowerCase() === 'mermaid') {
      return defaultFence ? defaultFence(tokens, idx, options, env, self) : ''
    }
    const lang = info.split(/\s+/)[0] || 'plaintext'
    const html = defaultFence ? defaultFence(tokens, idx, options, env, self) : ''
    return `<div class="md-code" data-lang="${lang}"><button type="button" class="md-code-copy" aria-label="Copy">copy</button>${html}</div>`
  }

  return md
}

export function prewarmMarkdown(): void {
  if (!mdPromise) mdPromise = buildMd()
}

export async function getMarkdownIt(source: string): Promise<MarkdownIt> {
  if (!mdPromise) mdPromise = buildMd()
  const build = mdPromise
  const [, md] = await Promise.all([ensureLangsForSource(source), build])
  return md
}

export async function renderMarkdown(source: string): Promise<string> {
  const md = await getMarkdownIt(source)
  return md.render(source)
}
