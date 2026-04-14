import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { invoke, onEvent } from '@/lib/ipc'
import { useSessions } from '@/state/sessions'

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
  const markExited = useSessions((s) => s.markExited)

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
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const offData = onEvent('pty:data', (p) => {
      if (p.ptyId === ptyId) term.write(p.data)
    })
    const offExit = onEvent('pty:exit', (p) => {
      if (p.ptyId === ptyId) markExited(ptyId, p.exitCode)
    })

    const inputDisposable = term.onData((data) => {
      void invoke('pty:write', { ptyId, data })
    })

    const resize = () => {
      fit.fit()
      void invoke('pty:resize', { ptyId, cols: term.cols, rows: term.rows })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    term.focus()

    return () => {
      observer.disconnect()
      inputDisposable.dispose()
      offData()
      offExit()
      term.dispose()
    }
  }, [ptyId, markExited])

  return <div ref={hostRef} className="h-full w-full" />
}
