import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
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
  const writeBufferRef = useRef<string[]>([])
  const rafRef = useRef<number>(0)
  const theme = useSettingsStore((s) => s.settings.theme)
  const terminalFontSize = useSettingsStore((s) => s.settings.terminalFontSize)
  const terminalFontFamily = useSettingsStore((s) => s.settings.terminalFontFamily)

  // Create terminal and attach to container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      theme: getTerminalTheme(themes[theme] ?? themes.obsidian),
      allowProposedApi: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    const unicodeAddon = new Unicode11Addon()
    terminal.loadAddon(unicodeAddon)
    terminal.unicode.activeVersion = '11'

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      writeBufferRef.current = []
      terminal.dispose()
      termRef.current = null
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme on live terminals when theme setting changes
  useEffect(() => {
    if (!termRef.current) return
    const themeObj = themes[theme] ?? themes.obsidian
    termRef.current.terminal.options.theme = getTerminalTheme(themeObj)
  }, [theme])

  // Refit + repaint when becoming active; track container resizes
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

    // Force full repaint — fixes rendering artifacts from writes while hidden
    requestAnimationFrame(() => {
      doFit()
      entry.terminal.refresh(0, entry.terminal.rows - 1)
      entry.terminal.focus()
    })
    setTimeout(doFit, 50)

    const ro = new ResizeObserver(() => requestAnimationFrame(doFit))
    ro.observe(el)

    return () => ro.disconnect()
  }, [isActive, sessionId])

  // Batched writes — coalesces rapid IPC data into single xterm.write() per frame
  const writeData = useCallback((data: string) => {
    writeBufferRef.current.push(data)
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const term = termRef.current?.terminal
        if (!term) return
        const chunks = writeBufferRef.current
        if (chunks.length === 0) return
        writeBufferRef.current = []
        term.write(chunks.length === 1 ? chunks[0] : chunks.join(''))
      })
    }
  }, [])

  return { containerRef, writeData }
}
