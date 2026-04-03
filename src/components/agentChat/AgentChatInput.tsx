import { useState, useRef, useCallback } from 'react'

interface AgentChatInputProps {
  onSend: (content: string) => void
  onCancel: () => void
  isStreaming: boolean
}

export function AgentChatInput({ onSend, onCancel, isStreaming }: AgentChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  return (
    <div className="border-t border-[var(--t-border)] p-4">
      <div className="flex items-end gap-2 max-w-[720px] mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent..."
          rows={1}
          className="flex-1 resize-none bg-[var(--t-bg-surface)] text-[var(--t-text-primary)] border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--t-accent)] placeholder:text-zinc-600"
          style={{ maxHeight: 120 }}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="flex-shrink-0 px-3 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex-shrink-0 px-3 py-2 text-sm rounded-lg bg-[var(--t-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
      <div className="text-center mt-1.5 text-[10px] text-zinc-600 max-w-[720px] mx-auto">
        {isStreaming ? 'Agent is responding...' : '⌘+Enter to send'}
      </div>
    </div>
  )
}
