import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { invoke, onEvent } from '@/lib/ipc'
import { useSettings } from '@/state/settings'

// Xterm front-end for a teammate window. Mirror lifecycle lives in main
// (`teammate-mirror.ts`): attach seeds scrollback via capture-pane and starts
// pipe-pane streaming; detach stops and cleans the fifo. Keystrokes invoke
// `teammate:sendKeys` (literal bytes) on the active tmux pane.

const TERMINAL_FONT_MAP: Record<string, string> = {
  'geist-mono': "'Geist Mono', ui-monospace, monospace",
  system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
}

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

export function TeammateXterm({ socket, pane }: { socket: string; pane: string }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalFont = useSettings((s) => s.settings.terminal.font)
  const terminalFontSize = useSettings((s) => s.settings.terminal.fontSize)

  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    term.options.fontFamily = TERMINAL_FONT_MAP[terminalFont] ?? TERMINAL_FONT_MAP.system
    term.options.fontSize = terminalFontSize
    fit.fit()
    term.refresh(0, term.rows - 1)
  }, [terminalFont, terminalFontSize])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_MAP[terminalFont] ?? TERMINAL_FONT_MAP.system,
      fontSize: terminalFontSize,
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
    termRef.current = term
    fitRef.current = fit
    fit.fit()

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

    // 1) Snapshot + subscribe. Writing snapshot first before subscribing to
    //    pipe-pane appends ensures the initial state matches what the user
    //    sees in their tmux pane.
    void (async () => {
      try {
        const { snapshot } = await invoke('teammate:attach', { socket, pane })
        if (cancelled) {
          void invoke('teammate:detach', { socket, pane }).catch(() => {})
          return
        }
        term.write(snapshot)
      } catch (err) {
        if (!cancelled) term.write(`\x1b[31m[teammate mirror failed: ${String(err)}]\x1b[0m\r\n`)
      }
    })()

    const offData = onEvent('teammate:data', (p) => {
      if (p.socket === socket && p.pane === pane) term.write(p.data)
    })

    const offExit = onEvent('teammate:mirrorExit', (p) => {
      if (p.socket !== socket || p.pane !== pane) return
      term.write('\r\n\x1b[2m[pane closed]\x1b[0m\r\n')
    })

    // Key batch: coalesce xterm.onData per animation frame so fast typing or
    // pastes land as one send-keys call (per rule in hooks-integration).
    let pending = ''
    let scheduled = false
    const flushInput = () => {
      scheduled = false
      if (!pending) return
      const data = pending
      pending = ''
      if (data.length > 64 * 1024) {
        void invoke('teammate:paste', { socket, pane, data }).catch((err) =>
          console.error('[teammate] paste failed:', err),
        )
      } else {
        void invoke('teammate:sendKeys', { socket, pane, data }).catch((err) =>
          console.error('[teammate] sendKeys failed:', err),
        )
      }
    }
    const inputDisposable = term.onData((data) => {
      pending += data
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(flushInput)
    })

    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)
    fit.fit()
    term.focus()

    return () => {
      cancelled = true
      observer.disconnect()
      inputDisposable.dispose()
      offData()
      offExit()
      termRef.current = null
      fitRef.current = null
      term.dispose()
      void invoke('teammate:detach', { socket, pane }).catch(() => {})
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: font settings handled by the separate effect
  }, [socket, pane])

  return <div ref={hostRef} className="h-full w-full" />
}
