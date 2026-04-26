import type MarkdownIt from 'markdown-it'

export function mermaidPlugin(md: MarkdownIt): void {
  const fence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = (token?.info ?? '').trim().toLowerCase()
    if (info === 'mermaid') {
      const code = token?.content ?? ''
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
      return `<div class="mermaid-host" data-mermaid-id="${id}"><pre class="mermaid-source">${escapeHtml(code)}</pre></div>\n`
    }
    return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
