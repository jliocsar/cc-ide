import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { mermaidPlugin } from './mermaid-plugin'

function md(): MarkdownIt {
  return new MarkdownIt({ html: true }).use(mermaidPlugin)
}

describe('mermaidPlugin', () => {
  it('wraps mermaid fences in mermaid-host with source', () => {
    const out = md().render('```mermaid\ngraph TD; A-->B\n```')
    expect(out).toContain('class="mermaid-host"')
    expect(out).toContain('data-mermaid-id="mermaid-')
    expect(out).toContain('class="mermaid-source"')
    expect(out).toContain('graph TD; A--&gt;B')
  })

  it('escapes HTML in source', () => {
    const out = md().render('```mermaid\n<script>x</script>\n```')
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(out).not.toContain('<script>x</script>')
  })

  it('does not affect non-mermaid fences', () => {
    const out = md().render('```ts\nconst x = 1\n```')
    expect(out).not.toContain('mermaid-host')
    expect(out).toContain('<code')
  })

  it('case-insensitive on info string', () => {
    const out = md().render('```Mermaid\nA\n```')
    expect(out).toContain('mermaid-host')
  })
})
