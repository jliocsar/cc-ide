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
  drawSelection,
  EditorView,
  GutterMarker,
  gutterLineClass,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { vim } from '@replit/codemirror-vim'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { CommentBubbleById } from '@/components/review/comment-surfaces'
import { isBuiltinFont, resolveFontFamily } from '@/lib/system-fonts'
import type { RangeDraft } from '@/state/review-comments'

export function buildFontExtension(font: string, fontSize: number): Extension {
  // Editor fonts can be sans (Geist, Space Grotesk) or mono (Geist Mono, system
  // family). 'mono' picks a monospace generic in the fallback chain — wrong for
  // sans built-ins, so route them through 'sans'.
  const isSans = font === 'geist' || font === 'space-grotesk'
  const family =
    isBuiltinFont(font) || font === 'system'
      ? resolveFontFamily(font, null, isSans ? 'sans' : 'mono')
      : resolveFontFamily(font, null, 'mono')
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
        const kind = match[1]?.toUpperCase()
        const cls = kind ? (calloutKinds[kind] ?? '') : ''
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
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: '1.6',
      scrollbarWidth: 'thin',
      scrollbarColor: 'oklch(1 0 0 / 18%) transparent',
    },
    '.cm-scroller::-webkit-scrollbar': { width: '8px', height: '8px' },
    '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
    '.cm-scroller::-webkit-scrollbar-button': { width: '8px', height: '8px' },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'oklch(1 0 0 / 18%)',
      borderRadius: '3px',
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': { background: 'oklch(1 0 0 / 30%)' },
    '.cm-scroller::-webkit-scrollbar-corner': { background: 'transparent' },
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
      fontVariantNumeric: 'tabular-nums',
      transition: 'background-color 150ms ease, border-color 150ms ease',
    },
    '.cm-plan-range': {
      backgroundColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 9%, transparent)',
      transition: 'background-color 150ms ease',
    },
    '.cm-plan-range-commented': {
      backgroundColor: 'transparent',
    },
    '.cm-lineNumbers .cm-gutterElement.cm-plan-range-gutter': {
      backgroundColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 9%, transparent)',
      borderLeftColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 75%, transparent)',
    },
    '.cm-lineNumbers .cm-gutterElement.cm-plan-range-commented-gutter': {
      backgroundColor: 'transparent',
      borderLeftColor: 'color-mix(in oklab, oklch(0.6 0.2 250) 40%, transparent)',
    },
    '.cm-comment-widget': {
      display: 'block',
      padding: '0',
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

/**
 * Bubble widget machinery — full RangeDraft list flows through a separate
 * effect so comment-text edits don't churn the line decoration field.
 */
export const setBubbleRangesEffect = StateEffect.define<RangeDraft[]>()

class CommentBubbleWidget extends WidgetType {
  root: Root | null = null
  constructor(
    public readonly tabId: string,
    public readonly rangeId: string,
  ) {
    super()
  }
  override eq(other: WidgetType): boolean {
    return (
      other instanceof CommentBubbleWidget &&
      other.tabId === this.tabId &&
      other.rangeId === this.rangeId
    )
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-comment-widget'
    el.dataset.rangeId = this.rangeId
    this.root = createRoot(el)
    this.root.render(createElement(CommentBubbleById, { tabId: this.tabId, rangeId: this.rangeId }))
    return el
  }
  override destroy(_dom: HTMLElement): void {
    const root = this.root
    this.root = null
    if (root) {
      // Defer unmount: React forbids unmounting during render commits.
      window.setTimeout(() => root.unmount(), 0)
    }
  }
  override ignoreEvent(_e: Event): boolean {
    return true
  }
  override get estimatedHeight(): number {
    return 80
  }
}

export const bubbleDecorationField = StateField.define<RangeDraft[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setBubbleRangesEffect)) return e.value
    }
    return value
  },
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const ranges = state.field(f)
      const doc = state.doc
      const builder: { from: number; deco: Decoration }[] = []
      for (const r of ranges) {
        const lastLineNo = r.start + r.len - 1
        if (lastLineNo < 1 || lastLineNo > doc.lines) continue
        // Mounting CommentBubbleById; it subscribes to the store so it
        // re-renders on comment-text edits without churning this field.
        const meta = makeBubbleMeta(state, r.id)
        if (!meta.tabId) continue
        const line = doc.line(lastLineNo)
        builder.push({
          from: line.to,
          deco: Decoration.widget({
            widget: new CommentBubbleWidget(meta.tabId, r.id),
            side: 1,
            block: true,
          }),
        })
      }
      builder.sort((a, b) => a.from - b.from)
      return Decoration.set(
        builder.map((b) => b.deco.range(b.from)),
        true,
      )
    }),
})

// The widget needs a tabId to subscribe. We tunnel it through a StateEffect
// so different editors using the same field share no cross-editor wiring.
const setBubbleTabIdEffect = StateEffect.define<string>()

const bubbleTabIdField = StateField.define<string>({
  create: () => '',
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setBubbleTabIdEffect)) return e.value
    }
    return value
  },
})

function makeBubbleMeta(state: EditorState, _rangeId: string): { tabId: string } {
  return { tabId: state.field(bubbleTabIdField, false) ?? '' }
}

export const setBubbleTabId = setBubbleTabIdEffect

export type ReviewHandlers = {
  onCommit: (start: number, end: number) => void
  onToggle: (lineNo: number) => boolean
  shouldIntercept?: () => boolean
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

const setPendingRangeEffect = StateEffect.define<{ start: number; end: number } | null>()

const pendingRangeField = StateField.define<{ start: number; end: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPendingRangeEffect)) return e.value
    }
    return value
  },
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const pending = state.field(f)
      if (!pending) return Decoration.none
      const doc = state.doc
      const min = Math.min(pending.start, pending.end)
      const max = Math.max(pending.start, pending.end)
      const builder: { from: number; deco: Decoration }[] = []
      for (let lineNo = min; lineNo <= max; lineNo++) {
        if (lineNo < 1 || lineNo > doc.lines) continue
        const line = doc.line(lineNo)
        builder.push({ from: line.from, deco: Decoration.line({ class: 'cm-plan-range' }) })
      }
      builder.sort((a, b) => a.from - b.from)
      return Decoration.set(
        builder.map((b) => b.deco.range(b.from, b.from)),
        true,
      )
    }),
})

export function reviewPointerExtension(handlers: ReviewHandlers): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      view: EditorView
      dragging = false
      pendingStart: number | null = null
      pendingEnd: number | null = null
      onDown: (e: PointerEvent) => void
      onMove: (e: PointerEvent) => void
      onUp: (e: PointerEvent) => void
      onCancel: (e: PointerEvent) => void

      constructor(view: EditorView) {
        this.view = view
        this.onDown = (e) => {
          if (e.button !== 0) return
          if (!(e.metaKey || e.ctrlKey)) return
          if (handlers.shouldIntercept && !handlers.shouldIntercept()) return
          const lineNo = lineFromY(view, e.clientY)
          if (lineNo === null) return
          if (handlers.onToggle(lineNo)) {
            e.preventDefault()
            return
          }
          this.pendingStart = lineNo
          this.pendingEnd = lineNo
          this.dragging = true
          view.dispatch({ effects: [setPendingRangeEffect.of({ start: lineNo, end: lineNo })] })
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          e.preventDefault()
        }
        this.onMove = (e) => {
          if (!this.dragging) return
          const lineNo = lineFromY(view, e.clientY)
          if (lineNo === null || lineNo === this.pendingEnd) return
          this.pendingEnd = lineNo
          if (this.pendingStart !== null) {
            view.dispatch({
              effects: [setPendingRangeEffect.of({ start: this.pendingStart, end: lineNo })],
            })
          }
        }
        this.onUp = (e) => {
          if (!this.dragging) return
          this.dragging = false
          ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
          if (this.pendingStart !== null) {
            const start = Math.min(this.pendingStart, this.pendingEnd ?? this.pendingStart)
            const end = Math.max(this.pendingStart, this.pendingEnd ?? this.pendingStart)
            handlers.onCommit(start, end)
          }
          this.pendingStart = null
          this.pendingEnd = null
          view.dispatch({ effects: [setPendingRangeEffect.of(null)] })
        }
        this.onCancel = (e) => {
          if (!this.dragging) return
          this.dragging = false
          ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
          this.pendingStart = null
          this.pendingEnd = null
          view.dispatch({ effects: [setPendingRangeEffect.of(null)] })
        }
        view.dom.addEventListener('pointerdown', this.onDown)
        view.dom.addEventListener('pointermove', this.onMove)
        view.dom.addEventListener('pointerup', this.onUp)
        view.dom.addEventListener('pointercancel', this.onCancel)
      }

      destroy(): void {
        this.view.dom.removeEventListener('pointerdown', this.onDown)
        this.view.dom.removeEventListener('pointermove', this.onMove)
        this.view.dom.removeEventListener('pointerup', this.onUp)
        this.view.dom.removeEventListener('pointercancel', this.onCancel)
      }
    },
  )

  return [pendingRangeField, plugin]
}

export function buildPlanExtensions(opts: {
  compartments: PlanCompartments
  keybinds: EditorKeybinds
  readOnly: boolean
  reviewPointer: Extension
  reviewCapable?: boolean
  tabId?: string
  font: string
  fontSize: number
}): Extension[] {
  const c = opts.compartments
  const reviewExts: Extension[] = opts.reviewCapable
    ? [bubbleTabIdField.init(() => opts.tabId ?? ''), bubbleDecorationField]
    : []
  return [
    history(),
    lineNumbers(),
    indentOnInput(),
    drawSelection(),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(monochromeHighlight),
    calloutsExtension,
    rangeDecorationField,
    ...reviewExts,
    c.reviewPointer.of(opts.reviewPointer),
    planEditorTheme,
    c.font.of(buildFontExtension(opts.font, opts.fontSize)),
    EditorView.lineWrapping,
    c.keymap.of(keymapExtensionFor(opts.keybinds)),
    c.readOnly.of(EditorState.readOnly.of(opts.readOnly)),
    c.editable.of(EditorView.editable.of(!opts.readOnly)),
  ]
}
