import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { invoke, onEvent } from '@/lib/ipc'
import { useLastTerminal } from '@/state/last-terminal'

const THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  selectionBackground: '#404040',
  black: '#0a0a0a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
}

export function XtermView({ ptyId }: { ptyId: string }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: THEME,
      allowTransparency: false,
      scrollback: 10_000,
      convertEol: false,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    // OSC 52: tmux (with `set-clipboard on`) emits this on copy-mode yank to
    // ask the terminal to write text to the system clipboard. Format is
    // `Pc;Pd` where Pd is base64. Pc is the clipboard selector (we treat all
    // selectors as the system clipboard).
    term.parser.registerOscHandler(52, (data: string) => {
      const semi = data.indexOf(';')
      if (semi < 0) return false
      const payload = data.slice(semi + 1)
      if (!payload || payload === '?') return false
      try {
        const text = atob(payload)
        void invoke('clipboard:write', { text })
        return true
      } catch {
        return false
      }
    })

    // Ctrl+Shift+C / Cmd+C with a selection: copy the xterm selection to
    // system clipboard and DON'T forward to the pty (so we don't send SIGINT).
    // Returning false from this handler tells xterm not to process the key.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      const isCopyShortcut =
        (ev.ctrlKey && ev.shiftKey && (ev.key === 'C' || ev.key === 'c')) ||
        (ev.metaKey && !ev.shiftKey && (ev.key === 'C' || ev.key === 'c'))
      if (!isCopyShortcut) return true
      const sel = term.getSelection()
      if (!sel) return true
      void invoke('clipboard:write', { text: sel })
      return false
    })

    const offData = onEvent('pty:data', (p) => {
      if (p.ptyId === ptyId) term.write(p.data)
    })

    const inputDisposable = term.onData((data) => {
      void invoke('pty:write', { ptyId, data })
    })

    const focusDisposable = term.onSelectionChange(() => useLastTerminal.getState().setLast(ptyId))
    host.addEventListener('focusin', () => useLastTerminal.getState().setLast(ptyId))
    host.addEventListener('pointerdown', () => useLastTerminal.getState().setLast(ptyId))

    // pty:resize fires SIGWINCH all the way to the app inside tmux. During a
    // window-frame drag the ResizeObserver fires every animation frame, which
    // floods tmux + claude with redraws and leaves the buffer half-rendered.
    // Debounce so the pty only learns about the final size; the local fit()
    // still runs every frame so xterm's own geometry stays accurate.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const flushPtyResize = () => {
      resizeTimer = null
      void invoke('pty:resize', { ptyId, cols: term.cols, rows: term.rows })
    }
    const resize = () => {
      fit.fit()
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(flushPtyResize, 150)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    fit.fit()
    // Force tmux to repaint the screen. Workspace-switch remounts reuse the
    // pty but create a fresh xterm Terminal — tmux doesn't know to redraw
    // because nothing changed from its perspective. The fix is to trigger a
    // real SIGWINCH: resize to slightly different dims, then back. tmux
    // responds with a full-screen redraw, which fills the new xterm. Same
    // mechanism that makes alt+tab "work" (window resize on focus change).
    const targetCols = term.cols
    const targetRows = term.rows
    void invoke('pty:resize', {
      ptyId,
      cols: Math.max(1, targetCols - 1),
      rows: targetRows,
    })
    setTimeout(() => {
      void invoke('pty:resize', { ptyId, cols: targetCols, rows: targetRows })
    }, 30)
    term.focus()

    return () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      observer.disconnect()
      inputDisposable.dispose()
      focusDisposable.dispose()
      offData()
      term.dispose()
    }
  }, [ptyId])

  return <div ref={hostRef} className="h-full w-full" />
}
