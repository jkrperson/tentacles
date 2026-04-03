export type ToolCallStatus = 'streaming' | 'pending_confirmation' | 'executing' | 'complete' | 'error'

export type AgentChatToolName =
  | 'list_projects'
  | 'open_project'
  | 'create_session'
  | 'list_sessions'
  | 'close_session'
  | 'list_workspaces'
  | 'create_workspace'

// Tools that only read data — auto-approved, no confirmation needed
export const READ_ONLY_TOOLS: AgentChatToolName[] = [
  'list_projects',
  'list_sessions',
  'list_workspaces',
]

export interface AgentChatToolCall {
  id: string
  name: AgentChatToolName
  arguments: Record<string, unknown>
  status: ToolCallStatus
  result?: unknown
  error?: string
}

export interface AgentChatMessagePart {
  type: 'text' | 'tool_call'
  text?: string
  toolCall?: AgentChatToolCall
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  parts: AgentChatMessagePart[]
  createdAt: number
}
