import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import {
  Compartment,
  EditorState,
  type Extension,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { vim } from '@replit/codemirror-vim'

export const EDITOR_FONT_MAP: Record<string, string> = {
  geist: 'var(--font-sans)',
  'geist-mono': 'var(--font-mono)',
  'space-grotesk': 'var(--font-condensed)',
  system: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
}

export function buildFontExtension(font: string, fontSize: number): Extension {
  const family = EDITOR_FONT_MAP[font] ?? 'var(--font-sans)'
  return EditorView.theme({
    '&': { fontSize: `${fontSize}px`, fontFamily: family },
    '.cm-scroller': { fontFamily: 'inherit' },
  })
}

export type PlanCompartments = {
  keymap: Compartment
  readOnly: Compartment
  editable: Compartment
  reviewPointer: Compartment
  font: Compartment
}

export function createPlanCompartments(): PlanCompartments {
  return {
    keymap: new Compartment(),
    readOnly: new Compartment(),
    editable: new Compartment(),
    reviewPointer: new Compartment(),
    font: new Compartment(),
  }
}

export type EditorKeybinds = 'vscode' | 'vim'

export function keymapExtensionFor(kind: EditorKeybinds): Extension {
  if (kind === 'vim') {
    return [vim(), keymap.of([...historyKeymap, ...searchKeymap, indentWithTab])]
  }
  return keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab])
}

const monochromeHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', color: 'var(--foreground)' },
  { tag: t.heading2, fontWeight: '700', color: 'var(--foreground)' },
  { tag: t.heading3, fontWeight: '600', color: 'var(--foreground)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600', color: 'var(--foreground)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--muted-foreground)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--muted-foreground)' },
  { tag: t.monospace, color: 'var(--foreground)', background: 'var(--muted)' },
  { tag: t.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--foreground)' },
  { tag: [t.keyword, t.typeName], color: 'var(--foreground)' },
  { tag: t.meta, color: 'var(--muted-foreground)' },
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
])

const calloutKinds: Record<string, string> = {
  NOTE: 'cm-callout-note',
  TIP: 'cm-callout-tip',
  IMPORTANT: 'cm-callout-important',
  WARNING: 'cm-callout-warning',
  CAUTION: 'cm-callout-caution',
}

const CALLOUT_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i

function buildCalloutDecorations(view: EditorView): DecorationSet {
  type Entry = { from: number; deco: Decoration }
  const entries: Entry[] = []
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      const match = CALLOUT_RE.exec(line.text)
      if (match) {
        const kind = match[1]!.toUpperCase()
        const cls = calloutKinds[kind] ?? ''
        if (cls) {
          entries.push({
            from: line.from,
            deco: Decoration.line({ class: `cm-callout ${cls}` }),
          })
          let nextPos = line.to + 1
          while (nextPos <= view.state.doc.length) {
            const nextLine = view.state.doc.lineAt(nextPos)
            if (!nextLine.text.startsWith('>')) break
            entries.push({
              from: nextLine.from,
              deco: Decoration.line({ class: `cm-callout-body ${cls}-body` }),
            })
            nextPos = nextLine.to + 1
            if (nextPos > to) break
          }
          pos = nextPos
          continue
        }
      }
      pos = line.to + 1
    }
  }
  return Decoration.set(
    entries.map((e) => e.deco.range(e.from, e.from)),
    true,
  )
}

export const calloutsExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildCalloutDecorations(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildCalloutDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export const planEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
      height: '100%',
    },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
    '.cm-content': { padding: '6px 0', caretColor: 'var(--foreground)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted-foreground)',
      border: 'none',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--foreground)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklab, var(--primary) 30%, transparent) !important',
    },
    // Vim block cursor: invert the single character under the cursor so it
    // stays readable against the bright fat-cursor background.
    '.cm-fat-cursor': {
      background: 'var(--primary) !important',
      color: 'var(--primary-foreground) !important',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
      background: 'none !important',
      outline: '1px solid var(--primary)',
      color: 'transparent !important',
    },
    '.cm-callout': {
      borderLeft: '2px solid var(--muted-foreground)',
      paddingLeft: '6px',
    },
    '.cm-callout-body': {
      borderLeft: '2px solid var(--muted-foreground)',
      paddingLeft: '6px',
    },
    '.cm-callout-note, .cm-callout-note-body': { borderLeftColor: 'oklch(0.7 0.12 240)' },
    '.cm-callout-tip, .cm-callout-tip-body': { borderLeftColor: 'oklch(0.72 0.15 150)' },
    '.cm-callout-important, .cm-callout-important-body': {
      borderLeftColor: 'oklch(0.72 0.19 310)',
    },
    '.cm-callout-warning, .cm-callout-warning-body': { borderLeftColor: 'oklch(0.78 0.16 80)' },
    '.cm-callout-caution, .cm-callout-caution-body': { borderLeftColor: 'oklch(0.7 0.2 25)' },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 14px 0 4px',
      borderLeft: '2px solid transparent',
    },
    '.cm-plan-range': {
      backgroundColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 18%, transparent)',
    },
    '.cm-plan-range-commented': {
      backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
    },
    '.cm-lineNumbers .cm-gutterElement.cm-plan-range-gutter': {
      backgroundColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 18%, transparent)',
      borderLeftColor: 'oklch(0.6 0.2 250)',
    },
    '.cm-lineNumbers .cm-gutterElement.cm-plan-range-commented-gutter': {
      backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
      borderLeftColor: 'var(--primary)',
    },
    '.cm-review-mode': { cursor: 'pointer' },
    '&:has(.cm-content.cm-review-mode) .cm-gutters': { cursor: 'pointer' },
    // In Review mode: no visible caret, no active-line highlight, no
    // text-selection tint. The editor is a read-only surface for line clicks.
    '.cm-content.cm-review-mode': { caretColor: 'transparent' },
    '.cm-content.cm-review-mode ::selection': { backgroundColor: 'transparent' },
    // CM6 renders the caret as a separate `.cm-cursor` div (inside
    // `.cm-cursorLayer`). `caretColor: transparent` only affects the native
    // text caret; we also need to hide the div-based cursor and the entire
    // cursor layer while in Review.
    '&:has(.cm-content.cm-review-mode) .cm-cursorLayer': { display: 'none' },
    '&:has(.cm-content.cm-review-mode) .cm-cursor, &:has(.cm-content.cm-review-mode) .cm-dropCursor':
      {
        display: 'none',
      },
  },
  { dark: true },
)

export type RangeDraftLite = {
  id: string
  start: number
  len: number
  hasComment: boolean
}

export const setRangesEffect = StateEffect.define<RangeDraftLite[]>()

class PlanRangeGutterMarker extends GutterMarker {
  override elementClass: string
  constructor(cls: string) {
    super()
    this.elementClass = cls
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof PlanRangeGutterMarker && other.elementClass === this.elementClass
  }
}

const planRangeGutterMarker = new PlanRangeGutterMarker('cm-plan-range-gutter')
const planRangeCommentedGutterMarker = new PlanRangeGutterMarker('cm-plan-range-commented-gutter')

export const rangeDecorationField = StateField.define<RangeDraftLite[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setRangesEffect)) return e.value
    }
    return value
  },
  provide: (f) => [
    EditorView.decorations.compute([f], (state) => {
      const ranges = state.field(f)
      const doc = state.doc
      const builder: { from: number; deco: Decoration }[] = []
      for (const r of ranges) {
        for (let i = 0; i < r.len; i++) {
          const lineNo = r.start + i
          if (lineNo < 1 || lineNo > doc.lines) continue
          const line = doc.line(lineNo)
          const cls = r.hasComment ? 'cm-plan-range cm-plan-range-commented' : 'cm-plan-range'
          builder.push({ from: line.from, deco: Decoration.line({ class: cls }) })
        }
      }
      builder.sort((a, b) => a.from - b.from)
      return Decoration.set(
        builder.map((b) => b.deco.range(b.from, b.from)),
        true,
      )
    }),
    gutterLineClass.compute([f], (state) => {
      const ranges = state.field(f)
      const doc = state.doc
      const entries: { from: number; marker: GutterMarker }[] = []
      for (const r of ranges) {
        for (let i = 0; i < r.len; i++) {
          const lineNo = r.start + i
          if (lineNo < 1 || lineNo > doc.lines) continue
          const line = doc.line(lineNo)
          entries.push({
            from: line.from,
            marker: r.hasComment ? planRangeCommentedGutterMarker : planRangeGutterMarker,
          })
        }
      }
      entries.sort((a, b) => a.from - b.from)
      return RangeSet.of(entries.map((e) => e.marker.range(e.from)))
    }),
  ],
})

export type ReviewHandlers = {
  onStart: (lineNo: number) => void
  onExtend: (lineNo: number) => void
  onToggle: (lineNo: number) => boolean
}

function lineFromY(view: EditorView, y: number): number | null {
  const rect = view.scrollDOM.getBoundingClientRect()
  if (y < rect.top || y > rect.bottom) return null
  const editorY = y - rect.top + view.scrollDOM.scrollTop
  try {
    const block = view.lineBlockAtHeight(editorY)
    return view.state.doc.lineAt(block.from).number
  } catch {
    return null
  }
}

export function reviewPointerExtension(handlers: ReviewHandlers): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      view: EditorView
      dragging = false
      onDown: (e: PointerEvent) => void
      onMove: (e: PointerEvent) => void
      onUp: (e: PointerEvent) => void

      constructor(view: EditorView) {
        this.view = view
        this.onDown = (e) => {
          if (e.button !== 0) return
          if (!(e.metaKey || e.ctrlKey)) return
          const lineNo = lineFromY(view, e.clientY)
          if (lineNo === null) return
          if (handlers.onToggle(lineNo)) {
            e.preventDefault()
            return
          }
          handlers.onStart(lineNo)
          this.dragging = true
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          e.preventDefault()
        }
        this.onMove = (e) => {
          if (!this.dragging) return
          const lineNo = lineFromY(view, e.clientY)
          if (lineNo === null) return
          handlers.onExtend(lineNo)
        }
        this.onUp = (e) => {
          if (!this.dragging) return
          this.dragging = false
          ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        }
        view.dom.addEventListener('pointerdown', this.onDown)
        view.dom.addEventListener('pointermove', this.onMove)
        view.dom.addEventListener('pointerup', this.onUp)
        view.dom.addEventListener('pointercancel', this.onUp)
      }

      destroy(): void {
        this.view.dom.removeEventListener('pointerdown', this.onDown)
        this.view.dom.removeEventListener('pointermove', this.onMove)
        this.view.dom.removeEventListener('pointerup', this.onUp)
        this.view.dom.removeEventListener('pointercancel', this.onUp)
      }
    },
  )

  return [plugin, EditorView.contentAttributes.of({ class: 'cm-review-mode' })]
}

export function buildPlanExtensions(opts: {
  compartments: PlanCompartments
  keybinds: EditorKeybinds
  readOnly: boolean
  reviewPointer: Extension
  font: string
  fontSize: number
}): Extension[] {
  const c = opts.compartments
  return [
    history(),
    lineNumbers(),
    indentOnInput(),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(monochromeHighlight),
    calloutsExtension,
    rangeDecorationField,
    c.reviewPointer.of(opts.reviewPointer),
    planEditorTheme,
    c.font.of(buildFontExtension(opts.font, opts.fontSize)),
    EditorView.lineWrapping,
    c.keymap.of(keymapExtensionFor(opts.keybinds)),
    c.readOnly.of(EditorState.readOnly.of(opts.readOnly)),
    c.editable.of(EditorView.editable.of(!opts.readOnly)),
  ]
}
