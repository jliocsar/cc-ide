import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'
import { mapRanges } from '@shared/review-range-map'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { toast } from 'sonner'
import { usePlanTabUi } from '@/state/plan-tab-ui'
import { EMPTY_RANGES, type RangeDraft, useReviewComments } from '@/state/review-comments'
import { useSettings } from '@/state/settings'
import {
  buildFontExtension,
  buildPlanExtensions,
  createPlanCompartments,
  keymapExtensionFor,
  type PlanCompartments,
  type RangeDraftLite,
  reviewPointerExtension,
  setRangesEffect,
} from './plan-editor-extensions'

type Props = {
  tabId: string
  initialContent: string
  onSave: (content: string) => Promise<void>
  reviewCapable?: boolean
}

export type MarkdownFileEditorHandle = {
  getBuffer: () => string
}

type ActiveSaveTarget = {
  view: EditorView
  save: () => Promise<void>
}

let activeSaveTarget: ActiveSaveTarget | null = null
let vimWriteRegistered = false

function ensureVimWriteRegistered(): void {
  if (vimWriteRegistered) return
  vimWriteRegistered = true
  Vim.defineEx('write', 'w', () => {
    if (activeSaveTarget) void activeSaveTarget.save()
  })
}

function rangesToLite(ranges: readonly RangeDraft[]): RangeDraftLite[] {
  return ranges.map((r) => ({
    id: r.id,
    start: r.start,
    len: r.len,
    hasComment: r.comment.trim().length > 0,
  }))
}

// Ctrl+click → review-line select. Active when:
//   - vim keybinds OFF (any time), OR
//   - vim ON AND vim is in NORMAL mode.
// Other vim modes (insert/replace/visual/visual-line/visual-block) pass through
// so the user can keep clicking to position the cursor or build vim selections.
function shouldInterceptCtrlClick(tabId: string): boolean {
  const keybinds = useSettings.getState().settings.editor.keybinds
  if (keybinds !== 'vim') return true
  const vimMode = usePlanTabUi.getState().vimModeByTab[tabId] ?? null
  return vimMode === 'NORMAL'
}

export const MarkdownFileEditor = forwardRef<MarkdownFileEditorHandle, Props>(
  function MarkdownFileEditor({ tabId, initialContent, onSave, reviewCapable = false }, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    useImperativeHandle(
      ref,
      () => ({
        getBuffer: () => viewRef.current?.state.doc.toString() ?? initialContent,
      }),
      [initialContent],
    )
    const compartmentsRef = useRef<PlanCompartments | null>(null)
    const keybinds = useSettings((s) => s.settings.editor.keybinds)
    const editorFont = useSettings((s) => s.settings.editor.font)
    const editorFontSize = useSettings((s) => s.settings.editor.fontSize)
    const contentRef = useRef(initialContent)
    contentRef.current = initialContent
    const lastSavedRef = useRef(initialContent)

    async function saveView(view: EditorView): Promise<void> {
      const content = view.state.doc.toString()
      if (content === lastSavedRef.current) {
        usePlanTabUi.getState().setDirty(tabId, false)
        return
      }
      try {
        await onSave(content)
        lastSavedRef.current = content
        usePlanTabUi.getState().setDirty(tabId, false)
      } catch (err) {
        toast.error('Save failed', {
          description: err instanceof Error ? err.message : String(err),
        })
      }
    }

    useEffect(() => {
      if (!hostRef.current) return
      ensureVimWriteRegistered()
      const compartments = createPlanCompartments()
      compartmentsRef.current = compartments
      const initialKeybinds = useSettings.getState().settings.editor.keybinds
      const reviewPointer = reviewCapable
        ? reviewPointerExtension({
            onStart: handleReviewStart,
            onExtend: handleReviewExtend,
            onToggle: handleReviewToggle,
            shouldIntercept: () => shouldInterceptCtrlClick(tabId),
          })
        : []
      const saveKeymap = Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run(view) {
              void saveView(view)
              return true
            },
          },
        ]),
      )
      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          saveKeymap,
          ...buildPlanExtensions({
            compartments,
            keybinds: initialKeybinds,
            readOnly: false,
            reviewPointer,
            font: useSettings.getState().settings.editor.font,
            fontSize: useSettings.getState().settings.editor.fontSize,
          }),
          EditorView.domEventHandlers({
            focus(_e, view) {
              activeSaveTarget = { view, save: () => saveView(view) }
              return false
            },
          }),
          EditorView.updateListener.of((u) => {
            const cm = getCM(u.view)
            const vimState = (
              cm as unknown as {
                state?: { vim?: { mode?: string; visualMode?: boolean } }
              } | null
            )?.state?.vim
            let modeLabel: string | null = null
            if (vimState) {
              if (vimState.visualMode) modeLabel = 'VISUAL'
              else if (vimState.mode === 'insert') modeLabel = 'INSERT'
              else if (vimState.mode === 'replace') modeLabel = 'REPLACE'
              else modeLabel = 'NORMAL'
            }
            const prev = usePlanTabUi.getState().vimModeByTab[tabId] ?? null
            if (prev !== modeLabel) usePlanTabUi.getState().setVimMode(tabId, modeLabel)
            if (!u.docChanged) return
            const content = u.state.doc.toString()
            usePlanTabUi.getState().setDirty(tabId, content !== lastSavedRef.current)
            if (!reviewCapable) return
            const store = useReviewComments.getState()
            const current = store.byTab[tabId] ?? EMPTY_RANGES
            if (current.length === 0) return
            const mapped = mapRanges(
              current as RangeDraft[],
              u.startState.doc,
              u.changes,
              u.state.doc,
            )
            store.replaceAll(tabId, mapped)
          }),
        ],
      })
      const view = new EditorView({ state, parent: hostRef.current })
      viewRef.current = view
      activeSaveTarget = { view, save: () => saveView(view) }

      let unsub: (() => void) | null = null
      if (reviewCapable) {
        const initialRanges = useReviewComments.getState().byTab[tabId] ?? EMPTY_RANGES
        view.dispatch({ effects: setRangesEffect.of(rangesToLite(initialRanges as RangeDraft[])) })

        unsub = useReviewComments.subscribe((s, prev) => {
          const next = s.byTab[tabId] ?? EMPTY_RANGES
          const old = prev.byTab[tabId] ?? EMPTY_RANGES
          if (next === old) return
          view.dispatch({ effects: setRangesEffect.of(rangesToLite(next as RangeDraft[])) })
        })
      }

      return () => {
        if (unsub) unsub()
        if (activeSaveTarget?.view === view) activeSaveTarget = null
        view.destroy()
        viewRef.current = null
        compartmentsRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId])

    useEffect(() => {
      const view = viewRef.current
      const c = compartmentsRef.current
      if (!view || !c) return
      view.dispatch({
        effects: c.keymap.reconfigure(keymapExtensionFor(keybinds)),
      })
    }, [keybinds])

    useEffect(() => {
      const view = viewRef.current
      const c = compartmentsRef.current
      if (!view || !c) return
      view.dispatch({
        effects: c.font.reconfigure(buildFontExtension(editorFont, editorFontSize)),
      })
    }, [editorFont, editorFontSize])

    function handleReviewStart(lineNo: number): void {
      useReviewComments.getState().startSingle(tabId, lineNo)
    }

    function handleReviewExtend(lineNo: number): void {
      useReviewComments.getState().extendLast(tabId, lineNo)
    }

    function handleReviewToggle(lineNo: number): boolean {
      const store = useReviewComments.getState()
      if (!store.isLineInAnyRange(tabId, lineNo)) return false
      store.toggleLine(tabId, lineNo)
      return true
    }

    return <div ref={hostRef} className="h-full w-full overflow-hidden" />
  },
)
