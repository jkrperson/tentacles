import { create } from 'zustand'
import { trpc } from '../trpc'
import type { AgentChatMessage, AgentChatToolCall, ToolCallStatus } from '../types/agentChat'
import { useSessionStore } from './sessionStore'
import { useWorkspaceStore } from './workspaceStore'
import { useUIStore } from './uiStore'

interface AgentChatState {
  messages: AgentChatMessage[]
  isStreaming: boolean
  error: string | null
  hasApiKey: boolean | null
  conversationId: string

  // Actions
  sendMessage: (content: string) => Promise<void>
  confirmToolCall: (toolCallId: string, approved: boolean) => Promise<void>
  cancelStream: () => void
  checkApiKey: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  deleteApiKey: () => Promise<void>

  // Internal — called by subscription handlers
  appendDelta: (messageId: string, delta: string) => void
  markStreamDone: () => void
  addToolCall: (messageId: string, toolCall: AgentChatToolCall) => void
  updateToolCallStatus: (toolCallId: string, status: ToolCallStatus, result?: unknown, error?: string) => void
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Check if a tool result contains a renderer action
function hasRendererAction(result: unknown): result is Record<string, unknown> & { _rendererAction: string } {
  return !!result && typeof result === 'object' && '_rendererAction' in result
}

// Execute renderer-side actions returned by tool calls
async function executeRendererAction(action: Record<string, unknown>): Promise<unknown> {
  switch (action._rendererAction) {
    case 'create_workspace': {
      const projectPath = action.projectPath as string
      const name = action.name as string | undefined
      const ws = await useWorkspaceStore.getState().createWorktreeWorkspace(projectPath, name)
      return { workspaceId: ws.id, name: ws.name, branch: ws.branch, message: `Workspace "${ws.name}" created` }
    }

    case 'create_session': {
      const workspaceId = action.workspaceId as string
      const name = action.name as string | undefined
      const agentType = action.agentType as string | undefined
      await useSessionStore.getState().createSessionInWorkspace(workspaceId, name, agentType)
      useUIStore.getState().openTerminalView()
      return { message: `Session created in workspace ${workspaceId}` }
    }

    case 'close_session': {
      const sessionId = action.sessionId as string
      useSessionStore.getState().removeSession(sessionId)
      return { closed: sessionId, message: `Session ${sessionId} closed` }
    }

    case 'open_project': {
      const projectPath = action.projectPath as string
      useUIStore.getState().switchProject(projectPath)
      return { opened: projectPath, message: 'Project opened' }
    }

    default:
      return action
  }
}

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  error: null,
  hasApiKey: null,
  conversationId: `conv_${generateId()}`,

  checkApiKey: async () => {
    try {
      const result = await trpc.agentChat.hasApiKey.query()
      set({ hasApiKey: result })
    } catch {
      set({ hasApiKey: false })
    }
  },

  setApiKey: async (key: string) => {
    await trpc.agentChat.setApiKey.mutate({ key })
    set({ hasApiKey: true })
  },

  deleteApiKey: async () => {
    await trpc.agentChat.deleteApiKey.mutate()
    set({ hasApiKey: false })
  },

  sendMessage: async (content: string) => {
    const { conversationId } = get()

    // Add user message
    const userMessage: AgentChatMessage = {
      id: `user_${generateId()}`,
      role: 'user',
      parts: [{ type: 'text', text: content }],
      createdAt: Date.now(),
    }

    // Add placeholder assistant message for streaming
    const assistantId = `msg_${generateId()}`
    const assistantMessage: AgentChatMessage = {
      id: assistantId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      createdAt: Date.now(),
    }

    set((s) => ({
      messages: [...s.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
    }))

    try {
      const result = await trpc.agentChat.sendMessage.mutate({
        conversationId,
        content,
      })
      // The actual messageId from the server — update our placeholder
      if (result.messageId !== assistantId) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, id: result.messageId } : m,
          ),
        }))
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Failed to send message'
      const isInvalidKey = rawMsg.includes('INVALID_API_KEY')
      set({
        isStreaming: false,
        error: isInvalidKey ? 'INVALID_API_KEY' : rawMsg,
        // Reset key state so user can re-enter
        ...(isInvalidKey ? { hasApiKey: false } : {}),
      })
      if (isInvalidKey) {
        // Delete the invalid key
        try { await trpc.agentChat.deleteApiKey.mutate() } catch { /* ignore */ }
      }
    }
  },

  confirmToolCall: async (toolCallId: string, approved: boolean) => {
    try {
      await trpc.agentChat.confirmToolCall.mutate({ toolCallId, approved })
    } catch (err) {
      console.error('[agentChat] confirmToolCall error:', err)
    }
  },

  cancelStream: () => {
    const { conversationId } = get()
    trpc.agentChat.cancelStream.mutate({ conversationId })
    set({ isStreaming: false })
  },

  appendDelta: (messageId: string, delta: string) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.role !== 'assistant') return m
        // Match by ID or use the last assistant message if ID doesn't match (server ID arrives later)
        const isTarget = m.id === messageId
        const isLastAssistant = m === s.messages[s.messages.length - 1] && m.role === 'assistant'
        if (!isTarget && !isLastAssistant) return m

        const parts = [...m.parts]
        const lastPart = parts[parts.length - 1]
        if (lastPart?.type === 'text') {
          parts[parts.length - 1] = { ...lastPart, text: (lastPart.text ?? '') + delta }
        } else {
          parts.push({ type: 'text', text: delta })
        }
        return { ...m, parts }
      }),
    }))
  },

  markStreamDone: () => {
    set({ isStreaming: false })
  },

  addToolCall: (messageId: string, toolCall: AgentChatToolCall) => {
    set((s) => {
      // Find the assistant message and add the tool call as a part
      // If we need a new follow-up message for the tool result, create one
      const messages = s.messages.map((m) => {
        if (m.role !== 'assistant') return m
        const isTarget = m.id === messageId
        const isLastAssistant = m === s.messages[s.messages.length - 1] && m.role === 'assistant'
        if (!isTarget && !isLastAssistant) return m

        return {
          ...m,
          parts: [...m.parts, { type: 'tool_call' as const, toolCall }],
        }
      })
      return { messages }
    })
  },

  updateToolCallStatus: (toolCallId: string, status: ToolCallStatus, result?: unknown, error?: string) => {
    // Check if the result requires renderer-side execution
    if (status === 'complete' && hasRendererAction(result)) {
      const action = result
      // Update status to executing while we process
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.role !== 'assistant') return m
          const hasTC = m.parts.some((p) => p.toolCall?.id === toolCallId)
          if (!hasTC) return m
          return {
            ...m,
            parts: m.parts.map((p) => {
              if (p.toolCall?.id !== toolCallId) return p
              return { ...p, toolCall: { ...p.toolCall, status: 'executing' } }
            }),
          }
        }),
      }))

      // Execute the renderer action asynchronously
      executeRendererAction(action).then((realResult) => {
        // Update the tool call with the real result
        const { conversationId } = get()
        updateToolCallInMessages(set, toolCallId, 'complete', realResult)

        // Report result back to main process for conversation context + follow-up
        trpc.agentChat.reportToolResult.mutate({
          conversationId,
          toolCallId,
          result: JSON.stringify(realResult),
        }).catch((err) => {
          console.error('[agentChat] reportToolResult error:', err)
        })
      }).catch((err) => {
        const errMsg = err instanceof Error ? err.message : 'Action failed'
        updateToolCallInMessages(set, toolCallId, 'error', undefined, errMsg)
      })
      return
    }

    updateToolCallInMessages(set, toolCallId, status, result, error)
  },
}))

// Helper to update tool call status in messages
function updateToolCallInMessages(
  set: (fn: (s: AgentChatState) => Partial<AgentChatState>) => void,
  toolCallId: string,
  status: ToolCallStatus,
  result?: unknown,
  error?: string,
) {
  set((s) => {
    const messages = s.messages.map((m) => {
      if (m.role !== 'assistant') return m
      const hasTC = m.parts.some((p) => p.toolCall?.id === toolCallId)
      if (!hasTC) return m

      return {
        ...m,
        parts: m.parts.map((p) => {
          if (p.toolCall?.id !== toolCallId) return p
          return {
            ...p,
            toolCall: { ...p.toolCall, status, result, error },
          }
        }),
      }
    })

    // If a follow-up stream is starting (after tool execution), add a new assistant message
    const needsFollowUp = status === 'complete' || status === 'error'
    if (needsFollowUp) {
      const followUpMessage: AgentChatMessage = {
        id: `msg_${generateId()}`,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        createdAt: Date.now(),
      }
      return { messages: [...messages, followUpMessage], isStreaming: true }
    }

    return { messages }
  })
}
