import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { trpc } from '../trpc'
import { useSettingsStore } from '../stores/settingsStore'
import { getTerminalTheme } from '../themes'
import { useResolvedTheme, useCustomThemes } from './useResolvedTheme'

interface UseTerminalOptions {
  sessionId: string
  isActive: boolean
}

export function useTerminal({ sessionId, isActive }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; fitAddon: FitAddon } | null>(null)
  const writeBufferRef = useRef<string[]>([])
  const rafRef = useRef<number>(0)
  const themeSetting = useSettingsStore((s) => s.settings.theme)
  const { customThemes } = useCustomThemes()
  const { theme: resolvedThemeDef } = useResolvedTheme(themeSetting, customThemes)
  const terminalFontSize = useSettingsStore((s) => s.settings.terminalFontSize)
  const terminalFontFamily = useSettingsStore((s) => s.settings.terminalFontFamily)
  const scrollSpeed = useSettingsStore((s) => s.settings.scrollSpeed)
  const scrollSpeedRef = useRef(scrollSpeed)
  useEffect(() => { scrollSpeedRef.current = scrollSpeed }, [scrollSpeed])

  // Create terminal and attach to container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      theme: getTerminalTheme(resolvedThemeDef),
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
      trpc.session.write.mutate({ id: sessionId, data })
    })

    // Map Shift+Enter to send the same escape sequence as Option+Enter
    // so Claude Code interprets it as a newline
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown') {
          trpc.session.write.mutate({ id: sessionId, data: '\x1b\r' })
        }
        return false
      }
      return true
    })

    terminal.open(el)
    termRef.current = { terminal, fitAddon }

    // Accelerate scroll speed by calling xterm's scrollLines() directly.
    // When mouse tracking is active (tmux mouse mode, vim, etc.),
    // let the event pass through so xterm forwards it to the application.
    const handleWheel = (e: WheelEvent) => {
      const speed = scrollSpeedRef.current
      if (speed <= 1) return
      if (terminal.modes.mouseTrackingMode !== 'none') return

      e.preventDefault()
      e.stopImmediatePropagation()

      const direction = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0
      const lines = direction * speed * (e.metaKey ? 2 : 1)
      terminal.scrollLines(lines)
    }
    el.addEventListener('wheel', handleWheel, { capture: true, passive: false })

    // Fit after layout settles
    const fit = () => {
      try {
        fitAddon.fit()
        trpc.session.resize.mutate({ id: sessionId, cols: terminal.cols, rows: terminal.rows })
      } catch { /* not visible yet */ }
    }
    requestAnimationFrame(fit)
    setTimeout(fit, 150)

    return () => {
      el.removeEventListener('wheel', handleWheel, { capture: true })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      writeBufferRef.current = []
      terminal.dispose()
      termRef.current = null
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme on live terminals when theme setting changes
  useEffect(() => {
    if (!termRef.current) return
    termRef.current.terminal.options.theme = getTerminalTheme(resolvedThemeDef)
  }, [resolvedThemeDef])

  // Refit + repaint when becoming active; track container resizes
  useEffect(() => {
    if (!isActive) return
    const entry = termRef.current
    const el = containerRef.current
    if (!entry || !el) return

    const doFit = () => {
      try {
        entry.fitAddon.fit()
        trpc.session.resize.mutate({ id: sessionId, cols: entry.terminal.cols, rows: entry.terminal.rows })
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
