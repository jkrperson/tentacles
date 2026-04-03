import { useEffect, useRef, useCallback } from 'react'
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

  const handleSaveApiKey = useCallback(async (key: string) => {
    await useAgentChatStore.getState().setApiKey(key)
  }, [])

  // Loading state
  if (hasApiKey === null) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Loading...
      </div>
    )
  }

  // API key setup
  if (!hasApiKey) {
    return <AgentChatApiKeySetup onSave={handleSaveApiKey} />
  }

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
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
          {error && (
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
