import { createPortal } from 'react-dom'
import { useCallback, useRef, useState, useEffect } from 'react'
import { useVoiceCommandStore } from '../../stores/voiceCommandStore'
import { useVoiceAudio } from '../../hooks/useVoiceAudio'
import type { VoiceCommandMessage } from '../../types/voiceCommand'
import type { AgentChatToolCall } from '../../types/agentChat'

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function MicPulse({ level }: { level: number }) {
  const r = Math.min(6 + level * 4, 10)
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0 overflow-hidden">
      <circle
        cx="12" cy="12"
        r={Math.min(r + 3, 11.5)}
        fill="none" stroke="currentColor" strokeWidth="1.5"
        opacity={level * 0.4}
        className="text-red-400 transition-all duration-75"
      />
      <circle
        cx="12" cy="12" r={r}
        fill="currentColor"
        className="text-red-500 transition-all duration-75"
        opacity={0.5 + level * 0.5}
      />
    </svg>
  )
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="animate-spin text-[var(--t-fg-muted)]" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded text-[10px] font-medium leading-none bg-[var(--t-bg-muted,#333)] text-[var(--t-fg-muted)] border border-[var(--t-border)]">
      {children}
    </kbd>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-green-400">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-400">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Tool call card
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  list_projects: 'List projects',
  open_project: 'Open project',
  list_workspaces: 'List workspaces',
  create_workspace: 'Create workspace',
  create_session: 'Create session',
  list_sessions: 'List sessions',
  close_session: 'Close session',
}

function ToolCard({ toolCall }: { toolCall: AgentChatToolCall }) {
  const confirmToolCall = useVoiceCommandStore((s) => s.confirmToolCall)
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name
  const isPending = toolCall.status === 'pending_confirmation'
  const isExecuting = toolCall.status === 'executing' || toolCall.status === 'streaming'
  const isComplete = toolCall.status === 'complete'
  const isError = toolCall.status === 'error'

  // Format args for display
  const argEntries = Object.entries(toolCall.arguments).filter(([, v]) => v != null)
  const argSummary = argEntries.map(([k, v]) => `${k}: ${String(v)}`).join(', ')

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--t-bg-muted,#1a1a1a)] border border-[var(--t-border)] text-xs">
      {isExecuting && <Spinner size={12} />}
      {isComplete && <CheckIcon />}
      {isError && <ErrorIcon />}
      {isPending && (
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}

      <span className="font-medium text-[var(--t-fg-base)]">{label}</span>

      {argSummary && (
        <span className="text-[var(--t-fg-muted)] truncate max-w-[300px]">{argSummary}</span>
      )}

      {isError && toolCall.error && (
        <span className="text-red-400 truncate max-w-[200px]">{toolCall.error}</span>
      )}

      {isPending && (
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => confirmToolCall(toolCall.id, true)}
            className="px-2 py-0.5 rounded bg-green-600/80 text-white hover:bg-green-600 transition-colors text-[10px] font-medium"
          >
            Approve
          </button>
          <button
            onClick={() => confirmToolCall(toolCall.id, false)}
            className="px-2 py-0.5 rounded bg-[var(--t-bg-base)] text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] border border-[var(--t-border)] transition-colors text-[10px] font-medium"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message component
// ---------------------------------------------------------------------------

function MessageRow({ message }: { message: VoiceCommandMessage }) {
  if (message.role === 'user') {
    const text = message.parts.find((p) => p.type === 'text')?.text
    if (!text) return null
    return (
      <div className="flex items-start gap-2 px-4 py-1.5">
        <span className="text-xs text-[var(--t-fg-muted)] mt-0.5 shrink-0 w-8">You</span>
        <p className="text-sm text-[var(--t-fg-base)]">{text}</p>
      </div>
    )
  }

  // Assistant message
  const textParts = message.parts.filter((p) => p.type === 'text' && p.text)
  const toolParts = message.parts.filter((p) => p.type === 'tool_call' && p.toolCall)
  const hasContent = textParts.some((p) => p.text && p.text.trim()) || toolParts.length > 0

  if (!hasContent) return null

  return (
    <div className="flex items-start gap-2 px-4 py-1.5">
      <span className="text-xs text-[var(--t-fg-muted)] mt-0.5 shrink-0 w-8">AI</span>
      <div className="flex-1 min-w-0 space-y-1">
        {textParts.map((p, i) => {
          const trimmed = p.text?.trim()
          if (!trimmed) return null
          return (
            <p key={i} className="text-sm text-[var(--t-fg-base)] leading-relaxed">{trimmed}</p>
          )
        })}
        {toolParts.map((p) => (
          <ToolCard key={p.toolCall!.id} toolCall={p.toolCall!} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main overlay
// ---------------------------------------------------------------------------

export function VoiceCommandOverlay() {
  useVoiceAudio()

  const isOpen = useVoiceCommandStore((s) => s.isOpen)
  const phase = useVoiceCommandStore((s) => s.phase)
  const transcript = useVoiceCommandStore((s) => s.transcript)
  const partialTranscript = useVoiceCommandStore((s) => s.partialTranscript)
  const messages = useVoiceCommandStore((s) => s.messages)
  const audioLevel = useVoiceCommandStore((s) => s.audioLevel)
  const inputMode = useVoiceCommandStore((s) => s.inputMode)
  const isStreaming = useVoiceCommandStore((s) => s.isStreaming)
  const error = useVoiceCommandStore((s) => s.error)
  const close = useVoiceCommandStore((s) => s.close)
  const setInputMode = useVoiceCommandStore((s) => s.setInputMode)
  const submitText = useVoiceCommandStore((s) => s.submitText)

  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus text input when switching to text mode
  useEffect(() => {
    if (isOpen && inputMode === 'text') {
      setTimeout(() => textInputRef.current?.focus(), 50)
    }
  }, [isOpen, inputMode])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, close])

  const handleTextSubmit = useCallback(() => {
    const trimmed = textInput.trim()
    if (!trimmed) return
    setTextInput('')
    submitText(trimmed)
  }, [textInput, submitText])

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }, [handleTextSubmit])

  if (!isOpen) return null

  const isListening = phase === 'listening' && inputMode === 'voice'
  const isProcessingAudio = phase === 'processing_audio'
  const isResolving = phase === 'resolving'
  const hasMessages = messages.length > 0

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none"
      style={{ paddingTop: '15vh' }}
    >
      <div className="pointer-events-auto w-[640px] max-w-[90vw] rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface,var(--t-bg-base))]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px -12px rgba(0,0,0,0.5)',
          maxHeight: '60vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--t-border)]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setInputMode(inputMode === 'voice' ? 'text' : 'voice')}
              className={`p-1 rounded transition-colors ${
                inputMode === 'voice'
                  ? 'text-red-400 bg-red-500/10'
                  : 'text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)]'
              }`}
              title={inputMode === 'voice' ? 'Switch to text input' : 'Switch to voice input'}
            >
              {inputMode === 'voice' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="9" x2="15" y1="20" y2="20" />
                  <line x1="12" x2="12" y1="4" y2="20" />
                </svg>
              )}
            </button>
          </div>

          <span className="text-xs font-medium text-[var(--t-fg-muted)] flex-1">Voice Command</span>

          <button
            onClick={close}
            className="p-1 rounded text-[var(--t-fg-muted)] hover:text-[var(--t-fg-base)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Message history */}
        {hasMessages && (
          <div className="flex-1 overflow-y-auto min-h-0 py-2">
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-[var(--t-border)] px-4 py-3">
          {inputMode === 'voice' ? (
            <div className="flex items-center gap-3">
              {isListening && <MicPulse level={audioLevel} />}
              {isProcessingAudio && <Spinner />}
              {isResolving && <Spinner />}
              {isStreaming && phase !== 'resolving' && phase !== 'processing_audio' && <Spinner />}

              <div className="flex-1 min-w-0">
                {isListening && !transcript && !partialTranscript && (
                  <p className="text-sm text-[var(--t-fg-muted)]">
                    {hasMessages ? 'Listening...' : 'Speak a command...'}
                  </p>
                )}
                {isListening && (transcript || partialTranscript) && (
                  <p className="text-sm truncate">
                    <span className="text-[var(--t-fg-base)]">{transcript}</span>
                    {partialTranscript && (
                      <span className="text-[var(--t-fg-muted)]">
                        {transcript ? ' ' : ''}{partialTranscript}
                      </span>
                    )}
                  </p>
                )}
                {isProcessingAudio && (
                  <p className="text-sm text-[var(--t-fg-muted)]">Transcribing...</p>
                )}
                {isResolving && (
                  <p className="text-sm text-[var(--t-fg-muted)]">Processing...</p>
                )}
                {phase === 'error' && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                {phase === 'executing' && (
                  <p className="text-sm text-[var(--t-fg-muted)]">Executing...</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={textInputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="Type a command..."
                disabled={isStreaming}
                className="flex-1 bg-transparent text-sm text-[var(--t-fg-base)] placeholder:text-[var(--t-fg-muted)] outline-none"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isStreaming}
                className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--t-fg-base)] text-[var(--t-bg-base)] disabled:opacity-30 transition-opacity"
              >
                Send
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-t border-[var(--t-border)] bg-[var(--t-bg-base)]/50">
          <span className="text-[10px] text-[var(--t-fg-muted)]">
            <Key>⌘</Key> <Key>K</Key> toggle
          </span>
          <span className="text-[10px] text-[var(--t-fg-muted)] mx-1">·</span>
          <span className="text-[10px] text-[var(--t-fg-muted)]">
            <Key>esc</Key> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
