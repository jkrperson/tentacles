import { useEffect, useRef, useCallback, useState } from 'react'
import { useAgentChatStore } from '../../stores/agentChatStore'
import { AgentChatMessage } from './AgentChatMessage'
import { AgentChatInput } from './AgentChatInput'
import { AgentChatApiKeySetup } from './AgentChatApiKeySetup'

export function AgentChatView() {
  const messages = useAgentChatStore((s) => s.messages)
  const isStreaming = useAgentChatStore((s) => s.isStreaming)
  const hasApiKey = useAgentChatStore((s) => s.hasApiKey)
  const error = useAgentChatStore((s) => s.error)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    useAgentChatStore.getState().checkApiKey()
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback((content: string) => {
    useAgentChatStore.getState().sendMessage(content)
  }, [])

  const handleCancel = useCallback(() => {
    useAgentChatStore.getState().cancelStream()
  }, [])

  const handleConfirmToolCall = useCallback((toolCallId: string, approved: boolean) => {
    useAgentChatStore.getState().confirmToolCall(toolCallId, approved)
  }, [])

  const [showKeySettings, setShowKeySettings] = useState(false)

  const handleSaveApiKey = useCallback(async (key: string) => {
    await useAgentChatStore.getState().setApiKey(key)
    setShowKeySettings(false)
  }, [])

  const handleChangeApiKey = useCallback(() => {
    setShowKeySettings(true)
  }, [])

  const handleCancelKeyChange = useCallback(() => {
    setShowKeySettings(false)
  }, [])

  // Loading state
  if (hasApiKey === null) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Loading...
      </div>
    )
  }

  // API key setup (initial or after invalid key)
  if (!hasApiKey) {
    return (
      <AgentChatApiKeySetup
        onSave={handleSaveApiKey}
        isReset={error === 'INVALID_API_KEY'}
      />
    )
  }

  // Show key setup overlay when user wants to change key
  if (showKeySettings) {
    return (
      <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
        <div className="flex items-center justify-end px-4 pt-3">
          <button
            onClick={handleCancelKeyChange}
            className="text-xs text-zinc-500 hover:text-[var(--t-text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
        <AgentChatApiKeySetup onSave={handleSaveApiKey} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      {/* Header with settings */}
      <div className="flex items-center justify-end px-4 pt-3 pb-1">
        <button
          onClick={handleChangeApiKey}
          className="text-xs text-zinc-500 hover:text-[var(--t-text-primary)] transition-colors flex items-center gap-1"
          title="Change API key"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
          </svg>
          API Key
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
        <div className="max-w-[720px] mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-zinc-600 text-sm mt-20">
              <p className="text-lg mb-2">Agent Chat</p>
              <p>Ask the agent to manage your projects and sessions.</p>
            </div>
          )}
          {messages.map((msg) => (
            <AgentChatMessage
              key={msg.id}
              message={msg}
              onConfirmToolCall={handleConfirmToolCall}
            />
          ))}
          {error && error !== 'INVALID_API_KEY' && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mt-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <AgentChatInput
        onSend={handleSend}
        onCancel={handleCancel}
        isStreaming={isStreaming}
      />
    </div>
  )
}
