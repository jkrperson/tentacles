import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useSettingsStore } from '../stores/settingsStore'
import { themes, getTerminalTheme } from '../themes'

interface UseTerminalOptions {
  sessionId: string
  isActive: boolean
}

export function useTerminal({ sessionId, isActive }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; fitAddon: FitAddon } | null>(null)
  const settings = useSettingsStore((s) => s.settings)

  // Create terminal and attach to container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: settings.terminalFontSize,
      fontFamily: settings.terminalFontFamily,
      theme: getTerminalTheme(themes[settings.theme] ?? themes.obsidian),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.onData((data) => {
      window.electronAPI.session.write(sessionId, data)
    })

    // Map Shift+Enter to send the same escape sequence as Option+Enter
    // so Claude Code interprets it as a newline
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown') {
          window.electronAPI.session.write(sessionId, '\x1b\r')
        }
        return false
      }
      return true
    })

    terminal.open(el)
    termRef.current = { terminal, fitAddon }

    // Fit after layout settles
    const fit = () => {
      try {
        fitAddon.fit()
        window.electronAPI.session.resize(sessionId, terminal.cols, terminal.rows)
      } catch { /* not visible yet */ }
    }
    requestAnimationFrame(fit)
    setTimeout(fit, 150)

    return () => {
      terminal.dispose()
      termRef.current = null
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme on live terminals when theme setting changes
  useEffect(() => {
    if (!termRef.current) return
    const theme = themes[settings.theme] ?? themes.obsidian
    termRef.current.terminal.options.theme = getTerminalTheme(theme)
  }, [settings.theme])

  // Refit when becoming active or container size changes (panel drag, window resize)
  useEffect(() => {
    if (!isActive) return
    const entry = termRef.current
    const el = containerRef.current
    if (!entry || !el) return

    const doFit = () => {
      try {
        entry.fitAddon.fit()
        window.electronAPI.session.resize(sessionId, entry.terminal.cols, entry.terminal.rows)
      } catch { /* ignore */ }
    }

    requestAnimationFrame(doFit)
    setTimeout(doFit, 50)

    const ro = new ResizeObserver(() => requestAnimationFrame(doFit))
    ro.observe(el)

    return () => ro.disconnect()
  }, [isActive, sessionId])

  const writeData = useCallback((data: string) => {
    termRef.current?.terminal.write(data)
  }, [])

  return { containerRef, writeData }
}
