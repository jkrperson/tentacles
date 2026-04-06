import { createPortal } from 'react-dom'
import { useCallback, useRef, useState, useEffect } from 'react'
import { useDictationStore } from '../stores/dictationStore'
import { useDictation } from '../hooks/useDictation'

function MicPulse({ level }: { level: number }) {
  const r = Math.min(6 + level * 4, 10)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 overflow-hidden">
      <circle
        cx="12"
        cy="12"
        r={Math.min(r + 3, 11.5)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={level * 0.4}
        className="text-red-400 transition-all duration-75"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="currentColor"
        className="text-red-500 transition-all duration-75"
        opacity={0.5 + level * 0.5}
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-[var(--t-fg-muted)]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/** Individual key cap, like Raycast's rounded-square keys */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md text-[11px] font-medium leading-none bg-[var(--t-bg-muted,#333)] text-[var(--t-fg-muted)] border border-[var(--t-border)]">
      {children}
    </kbd>
  )
}

/** Thin vertical separator between footer actions */
function Sep() {
  return <span className="w-px h-3.5 bg-[var(--t-border)] opacity-60" />
}

export function DictationOverlay() {
  useDictation()

  const phase = useDictationStore((s) => s.phase)
  const rawTranscript = useDictationStore((s) => s.rawTranscript)
  const error = useDictationStore((s) => s.error)
  const audioLevel = useDictationStore((s) => s.audioLevel)
  const cancel = useDictationStore((s) => s.cancel)
  const stopRecording = useDictationStore((s) => s.stopRecording)

  // Dragging state
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const startOffset = useRef({ x: 0, y: 0 })

  const isActive = phase !== 'idle'
  useEffect(() => {
    if (isActive) setOffset({ x: 0, y: 0 })
  }, [isActive])

  // Escape key to cancel
  useEffect(() => {
    if (!isActive && !error) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isActive, error, cancel])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    startOffset.current = { ...offset }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [offset])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setOffset({
      x: startOffset.current.x + (e.clientX - dragStart.current.x),
      y: startOffset.current.y + (e.clientY - dragStart.current.y),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  if (phase === 'idle' && !error) return null

  const isRecording = phase === 'recording'
  const isProcessing = phase === 'processing'
  const isError = phase === 'idle' && !!error
  const hasTranscript = !!rawTranscript

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none"
      style={{ paddingTop: '20vh' }}
    >
      <div
        className="pointer-events-auto w-[680px] max-w-[90vw] rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface,var(--t-bg-base))]/95 backdrop-blur-xl shadow-2xl cursor-grab active:cursor-grabbing select-none overflow-hidden"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px -12px rgba(0,0,0,0.5)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Main content area — large, spacious like Raycast's search field */}
        <div className="px-5 py-4 min-h-[56px] flex items-center gap-3">
          {isProcessing && <Spinner />}
          {isError && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-400">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}

          <div className="flex-1 min-w-0">
            {isRecording && !hasTranscript && (
              <p className="text-base text-[var(--t-fg-muted)]">Speak now...</p>
            )}
            {isRecording && hasTranscript && (
              <p className="text-base text-[var(--t-fg-base)] leading-relaxed whitespace-pre-wrap line-clamp-1">
                {rawTranscript}
              </p>
            )}
            {isProcessing && (
              <p className="text-base text-[var(--t-fg-muted)]">Cleaning up...</p>
            )}
            {isError && (
              <p className="text-base text-red-400">{error}</p>
            )}
          </div>
        </div>

        {/* Expanded transcript when text overflows one line */}
        {isRecording && hasTranscript && rawTranscript.length > 70 && (
          <div className="border-t border-[var(--t-border)] px-5 py-3 max-h-32 overflow-y-auto">
            <p className="text-sm text-[var(--t-fg-base)] leading-relaxed whitespace-pre-wrap">
              {rawTranscript}
            </p>
          </div>
        )}

        {/* Footer bar — Raycast style: status left, actions right */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--t-border)] bg-[var(--t-bg-base)]/50">
          {isRecording && (
            <>
              <MicPulse level={audioLevel} />
              <span className="text-xs text-[var(--t-fg-muted)]">Listening</span>
            </>
          )}
          {isProcessing && (
            <span className="text-xs text-[var(--t-fg-muted)]">Processing transcript...</span>
          )}
          {isError && (
            <span className="text-xs text-[var(--t-fg-muted)]">Error</span>
          )}

          <div className="flex-1" />

          {isRecording && (
            <div className="flex items-center gap-3">
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-2 text-xs text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
              >
                Finish
                <span className="inline-flex items-center gap-0.5">
                  <Key>⌘</Key><Key>⇧</Key><Key>D</Key>
                </span>
              </button>
              <Sep />
              <button
                onClick={cancel}
                className="inline-flex items-center gap-2 text-xs text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
              >
                Cancel
                <Key>esc</Key>
              </button>
            </div>
          )}
          {isError && (
            <button
              onClick={cancel}
              className="inline-flex items-center gap-2 text-xs text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
            >
              Dismiss
              <Key>esc</Key>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
