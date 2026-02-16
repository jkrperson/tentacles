import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useSettingsStore } from '../stores/settingsStore'
import { themes, getTerminalTheme } from '../themes'

interface UseShellTerminalOptions {
  terminalId: string
  isActive: boolean
}

export function useShellTerminal({ terminalId, isActive }: UseShellTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; fitAddon: FitAddon } | null>(null)
  const settings = useSettingsStore((s) => s.settings)

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
      window.electronAPI.terminal.write(terminalId, data)
    })

    // Map Shift+Enter to send the same escape sequence as Option+Enter
    // so Claude Code interprets it as a newline
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown') {
          window.electronAPI.terminal.write(terminalId, '\x1b\r')
        }
        return false
      }
      return true
    })

    terminal.open(el)
    termRef.current = { terminal, fitAddon }

    const fit = () => {
      try {
        fitAddon.fit()
        window.electronAPI.terminal.resize(terminalId, terminal.cols, terminal.rows)
      } catch { /* not visible yet */ }
    }
    requestAnimationFrame(fit)
    setTimeout(fit, 150)

    return () => {
      terminal.dispose()
      termRef.current = null
    }
  }, [terminalId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme on live terminals when theme setting changes
  useEffect(() => {
    if (!termRef.current) return
    const theme = themes[settings.theme] ?? themes.obsidian
    termRef.current.terminal.options.theme = getTerminalTheme(theme)
  }, [settings.theme])

  useEffect(() => {
    if (!isActive) return
    const entry = termRef.current
    const el = containerRef.current
    if (!entry || !el) return

    const doFit = () => {
      try {
        entry.fitAddon.fit()
        window.electronAPI.terminal.resize(terminalId, entry.terminal.cols, entry.terminal.rows)
      } catch { /* ignore */ }
    }

    requestAnimationFrame(doFit)
    setTimeout(doFit, 50)

    const ro = new ResizeObserver(() => requestAnimationFrame(doFit))
    ro.observe(el)

    return () => ro.disconnect()
  }, [isActive, terminalId])

  const writeData = useCallback((data: string) => {
    termRef.current?.terminal.write(data)
  }, [])

  return { containerRef, writeData }
}
