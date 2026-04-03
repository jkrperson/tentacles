import type { AgentChatMessage as MessageType } from '../../types/agentChat'
import { AgentChatToolCard } from './AgentChatToolCard'

interface AgentChatMessageProps {
  message: MessageType
  onConfirmToolCall: (toolCallId: string, approved: boolean) => void
}

export function AgentChatMessage({ message, onConfirmToolCall }: AgentChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className="mb-4">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
        {isUser ? 'You' : 'Agent'}
      </div>
      {isUser ? (
        <div className="bg-[var(--t-bg-surface)] rounded-lg px-3 py-2 text-sm text-[var(--t-text-primary)]">
          {message.parts.map((part, i) => (
            <span key={i}>{part.text}</span>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[var(--t-text-primary)]">
          {message.parts.map((part, i) => {
            if (part.type === 'tool_call' && part.toolCall) {
              return (
                <AgentChatToolCard
                  key={part.toolCall.id}
                  toolCall={part.toolCall}
                  onConfirm={onConfirmToolCall}
                />
              )
            }
            // Render text, splitting on newlines for basic formatting
            if (part.text) {
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              )
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}
