import { createPortal } from 'react-dom'
import { useDictationStore } from '../stores/dictationStore'
import { useDictation } from '../hooks/useDictation'

function MicIndicator({ level }: { level: number }) {
  // Scale from 12px to 24px based on audio level
  const size = 12 + level * 12
  const opacity = 0.4 + level * 0.6

  return (
    <span className="relative flex items-center justify-center" style={{ width: 24, height: 24 }}>
      {/* Glow ring */}
      <span
        className="absolute rounded-full bg-red-500/30"
        style={{
          width: size + 8,
          height: size + 8,
          opacity: level * 0.6,
          transition: 'all 80ms ease-out',
        }}
      />
      {/* Core dot */}
      <span
        className="absolute rounded-full bg-red-500"
        style={{
          width: size,
          height: size,
          opacity,
          transition: 'all 80ms ease-out',
        }}
      />
    </span>
  )
}

export function DictationOverlay() {
  useDictation()

  const phase = useDictationStore((s) => s.phase)
  const rawTranscript = useDictationStore((s) => s.rawTranscript)
  const error = useDictationStore((s) => s.error)
  const audioLevel = useDictationStore((s) => s.audioLevel)
  const cancel = useDictationStore((s) => s.cancel)
  const stopRecording = useDictationStore((s) => s.stopRecording)

  if (phase === 'idle' && !error) return null

  return createPortal(
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-xl w-full mx-4 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface,var(--t-bg-base))] shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--t-border)]">
          {phase === 'recording' && (
            <>
              <MicIndicator level={audioLevel} />
              <span className="text-sm font-medium text-[var(--t-fg-base)]">
                Listening...
              </span>
              <div className="flex-1" />
              <button
                onClick={stopRecording}
                className="text-xs px-3 py-1 rounded-md bg-[var(--t-bg-muted,#333)] text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
              >
                Stop
              </button>
              <button
                onClick={cancel}
                className="text-xs px-2 py-1 text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {phase === 'processing' && (
            <>
              <svg className="animate-spin h-4 w-4 text-[var(--t-fg-muted)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium text-[var(--t-fg-base)]">
                Cleaning up...
              </span>
            </>
          )}
          {phase === 'idle' && error && (
            <>
              <span className="text-sm text-red-400">{error}</span>
              <div className="flex-1" />
              <button
                onClick={cancel}
                className="text-xs px-2 py-1 text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
              >
                Dismiss
              </button>
            </>
          )}
        </div>

        {/* Transcript body */}
        {rawTranscript && (
          <div className="px-4 py-3 max-h-40 overflow-y-auto">
            <p className="text-sm text-[var(--t-fg-base)] leading-relaxed whitespace-pre-wrap">
              {rawTranscript}
            </p>
          </div>
        )}

        {/* Empty state while recording */}
        {phase === 'recording' && !rawTranscript && (
          <div className="px-4 py-3">
            <p className="text-sm text-[var(--t-fg-muted)] italic">Speak now...</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
