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
  // Gate live data until scrollback is replayed to prevent out-of-order rendering
  const scrollbackLoadedRef = useRef(false)
  const pendingLiveDataRef = useRef<string[]>([])
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

    // Reset scrollback gate for this session
    scrollbackLoadedRef.current = false
    pendingLiveDataRef.current = []

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
    terminal.loadAddon(new WebLinksAddon((_event, url) => {
      trpc.app.openExternal.mutate({ url })
    }))
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

    // Replay scrollback from daemon (for sessions that survived an app restart),
    // then flush any live data that arrived in the meantime.
    trpc.session.getScrollback.query({ id: sessionId }).then((data) => {
      if (termRef.current?.terminal === terminal) {
        if (data) terminal.write(data)
        // Flush any live data that arrived while scrollback was loading
        const pending = pendingLiveDataRef.current
        if (pending.length > 0) {
          terminal.write(pending.join(''))
          pendingLiveDataRef.current = []
        }
        scrollbackLoadedRef.current = true
      }
    }).catch(() => {
      // No scrollback available — ungate immediately
      scrollbackLoadedRef.current = true
      const pending = pendingLiveDataRef.current
      if (pending.length > 0 && termRef.current?.terminal === terminal) {
        terminal.write(pending.join(''))
        pendingLiveDataRef.current = []
      }
    })

    // Custom scroll handler — takes full control of wheel scrolling so we can
    // apply the user's scroll-speed multiplier consistently.
    // When mouse tracking is active (e.g. vim), let the event pass through.
    // We accumulate sub-line pixel deltas so trackpad scrolling feels smooth.
    let scrollAccumulator = 0
    const LINE_HEIGHT = 20 // approximate pixel height of one terminal line
    const handleWheel = (e: WheelEvent) => {
      if (terminal.modes.mouseTrackingMode !== 'none') return

      e.preventDefault()
      e.stopImmediatePropagation()

      const speed = scrollSpeedRef.current * (e.metaKey ? 2 : 1)

      // Normalize deltaY to lines depending on deltaMode
      let deltaLines: number
      if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        // Trackpad / smooth scroll — accumulate fractional lines
        scrollAccumulator += (e.deltaY / LINE_HEIGHT) * speed
        deltaLines = Math.trunc(scrollAccumulator)
        scrollAccumulator -= deltaLines
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaLines = Math.round(e.deltaY * speed)
      } else {
        // DOM_DELTA_PAGE
        deltaLines = Math.round(e.deltaY * terminal.rows * speed)
      }

      if (deltaLines !== 0) {
        terminal.scrollLines(deltaLines)
      }
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
      pendingLiveDataRef.current = []
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

  // Batched writes — coalesces rapid IPC data into single xterm.write() per frame.
  // If scrollback hasn't loaded yet, buffer data to replay after scrollback.
  const writeData = useCallback((data: string) => {
    if (!scrollbackLoadedRef.current) {
      pendingLiveDataRef.current.push(data)
      return
    }
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
