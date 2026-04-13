import { create } from 'zustand'
import { trpc } from '../trpc'
import type { AgentChatToolCall, ToolCallStatus } from '../types/agentChat'
import type { VoiceCommandMessage, VoiceCommandPhase } from '../types/voiceCommand'
import { useSessionStore } from './sessionStore'
import { useWorkspaceStore } from './workspaceStore'
import { useUIStore } from './uiStore'
import { useDictationStore } from './dictationStore'

const MAX_MESSAGES = 20

interface VoiceCommandState {
  isOpen: boolean
  phase: VoiceCommandPhase
  transcript: string
  messages: VoiceCommandMessage[]
  isStreaming: boolean
  error: string | null
  audioLevel: number
  inputMode: 'voice' | 'text'
  conversationId: string

  // Actions
  toggle: () => void
  open: () => void
  close: () => void
  setPhase: (phase: VoiceCommandPhase) => void
  appendTranscript: (text: string) => void
  submitTranscript: () => Promise<void>
  submitText: (text: string) => Promise<void>
  setInputMode: (mode: 'voice' | 'text') => void
  setAudioLevel: (level: number) => void
  setError: (error: string | null) => void
  confirmToolCall: (toolCallId: string, approved: boolean) => Promise<void>
  cancelStream: () => void

  // Internal — called by subscription handlers
  appendDelta: (messageId: string, delta: string) => void
  markStreamDone: () => void
  addToolCall: (messageId: string, toolCall: AgentChatToolCall) => void
  updateToolCallStatus: (toolCallId: string, status: ToolCallStatus, result?: unknown, error?: string) => void
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function hasRendererAction(result: unknown): result is Record<string, unknown> & { _rendererAction: string } {
  return !!result && typeof result === 'object' && '_rendererAction' in result
}

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

function trimMessages(messages: VoiceCommandMessage[]): VoiceCommandMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages
  return messages.slice(-MAX_MESSAGES)
}

export const useVoiceCommandStore = create<VoiceCommandState>((set, get) => ({
  isOpen: false,
  phase: 'idle',
  transcript: '',
  messages: [],
  isStreaming: false,
  error: null,
  audioLevel: 0,
  inputMode: 'voice',
  conversationId: `vc_${generateId()}`,

  toggle: () => {
    const { isOpen } = get()
    if (isOpen) {
      get().close()
    } else {
      get().open()
    }
  },

  open: () => {
    // Cancel active dictation if running
    const dictation = useDictationStore.getState()
    if (dictation.phase !== 'idle') {
      dictation.cancel()
    }

    const newConversationId = `vc_${generateId()}`
    set({
      isOpen: true,
      phase: 'listening',
      transcript: '',
      messages: [],
      isStreaming: false,
      error: null,
      audioLevel: 0,
      inputMode: 'voice',
      conversationId: newConversationId,
    })
  },

  close: () => {
    const { conversationId, isStreaming } = get()
    if (isStreaming) {
      trpc.voiceCommand.cancelStream.mutate({ conversationId }).catch(() => {})
    }
    trpc.voiceCommand.clearConversation.mutate({ conversationId }).catch(() => {})
    set({
      isOpen: false,
      phase: 'idle',
      transcript: '',
      isStreaming: false,
      error: null,
      audioLevel: 0,
    })
  },

  setPhase: (phase) => set({ phase }),

  appendTranscript: (text) => {
    set((s) => ({ transcript: s.transcript + (s.transcript ? ' ' : '') + text }))
  },

  submitTranscript: async () => {
    const { transcript } = get()
    if (!transcript.trim()) {
      set({ phase: 'listening' })
      return
    }
    await get().submitText(transcript)
    set({ transcript: '' })
  },

  submitText: async (content: string) => {
    const { conversationId } = get()
    const trimmed = content.trim()
    if (!trimmed) return

    const userMessage: VoiceCommandMessage = {
      id: `user_${generateId()}`,
      role: 'user',
      parts: [{ type: 'text', text: trimmed }],
      createdAt: Date.now(),
    }

    const assistantId = `vc_${generateId()}`
    const assistantMessage: VoiceCommandMessage = {
      id: assistantId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      createdAt: Date.now(),
    }

    set((s) => ({
      messages: trimMessages([...s.messages, userMessage, assistantMessage]),
      isStreaming: true,
      error: null,
      phase: 'resolving',
    }))

    try {
      const result = await trpc.voiceCommand.sendMessage.mutate({
        conversationId,
        content: trimmed,
      })
      if (result.messageId !== assistantId) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, id: result.messageId } : m,
          ),
        }))
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Failed to process command'
      set({
        isStreaming: false,
        error: rawMsg,
        phase: 'error',
      })
    }
  },

  setInputMode: (mode) => {
    set({ inputMode: mode })
    if (mode === 'voice') {
      set({ phase: 'listening', transcript: '' })
    }
  },

  setAudioLevel: (level) => set({ audioLevel: level }),

  setError: (error) => set({ error, phase: error ? 'error' : 'result' }),

  confirmToolCall: async (toolCallId: string, approved: boolean) => {
    try {
      await trpc.voiceCommand.confirmToolCall.mutate({ toolCallId, approved })
    } catch (err) {
      console.error('[voiceCommand] confirmToolCall error:', err)
    }
  },

  cancelStream: () => {
    const { conversationId } = get()
    trpc.voiceCommand.cancelStream.mutate({ conversationId }).catch(() => {})
    set({ isStreaming: false, phase: 'result' })
  },

  appendDelta: (messageId: string, delta: string) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.role !== 'assistant') return m
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
    set((s) => {
      const wasProcessing = s.phase === 'resolving' || s.phase === 'executing'
      return {
        isStreaming: false,
        // Return to listening so the mic reactivates for follow-up commands
        phase: wasProcessing ? (s.inputMode === 'voice' ? 'listening' : 'result') : s.phase,
        transcript: wasProcessing && s.inputMode === 'voice' ? '' : s.transcript,
      }
    })
  },

  addToolCall: (messageId: string, toolCall: AgentChatToolCall) => {
    set((s) => {
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
      return { messages, phase: 'executing' }
    })
  },

  updateToolCallStatus: (toolCallId: string, status: ToolCallStatus, result?: unknown, error?: string) => {
    if (status === 'complete' && hasRendererAction(result)) {
      const action = result
      // Mark as executing
      updateToolCallInMessages(set, toolCallId, 'executing')

      executeRendererAction(action).then((realResult) => {
        const { conversationId } = get()
        updateToolCallInMessages(set, toolCallId, 'complete', realResult)

        trpc.voiceCommand.reportToolResult.mutate({
          conversationId,
          toolCallId,
          result: JSON.stringify(realResult),
        }).catch((err) => {
          console.error('[voiceCommand] reportToolResult error:', err)
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

function updateToolCallInMessages(
  set: (fn: (s: VoiceCommandState) => Partial<VoiceCommandState>) => void,
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
          return { ...p, toolCall: { ...p.toolCall, status, result, error } }
        }),
      }
    })

    const needsFollowUp = status === 'complete' || status === 'error'
    if (needsFollowUp) {
      const followUpMessage: VoiceCommandMessage = {
        id: `vc_${generateId()}`,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        createdAt: Date.now(),
      }
      return { messages: [...messages, followUpMessage], isStreaming: true }
    }

    return { messages }
  })
}
