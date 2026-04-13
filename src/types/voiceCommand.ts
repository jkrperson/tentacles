import type { AgentChatToolName, AgentChatToolCall, AgentChatMessagePart } from './agentChat'

export type VoiceCommandPhase =
  | 'idle'
  | 'listening'
  | 'processing_audio'
  | 'resolving'
  | 'executing'
  | 'result'
  | 'error'

// Tools that auto-execute without confirmation in voice command mode.
// Includes navigation (open_project) in addition to read-only tools.
export const VOICE_AUTO_EXECUTE_TOOLS: AgentChatToolName[] = [
  'list_projects',
  'list_sessions',
  'list_workspaces',
  'open_project',
]

export interface VoiceCommandMessage {
  id: string
  role: 'user' | 'assistant'
  parts: AgentChatMessagePart[]
  createdAt: number
}

export type { AgentChatToolCall as VoiceCommandToolCall }
