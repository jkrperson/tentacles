import { EventEmitter } from 'events'
import type { FileChangeEvent, GitHubUser, SetupLogEntry, UpdaterStatus } from '../../src/types'
import type { ToolCallStatus, AgentChatToolName } from '../../src/types/agentChat'

export interface EventMap {
  'session:data': { id: string; data: string }
  'session:exit': { id: string; exitCode: number }
  'session:title': { id: string; title: string }
  'session:statusDetail': { id: string; detail: string | null }
  'session:agentStatus': { id: string; status: 'running' | 'needs_input' | 'completed' | 'idle' }
  'session:listChanged': Record<string, never>
  'project:listChanged': Record<string, never>
  'workspace:listChanged': Record<string, never>
  'terminal:data': { id: string; data: string }
  'terminal:exit': { id: string; exitCode: number }
  'terminal:title': { id: string; title: string }
  'file:changed': FileChangeEvent
  'updater:status': UpdaterStatus
  'auth:changed': { user: GitHubUser | null }
  'setup:output': { workspaceId: string; scriptIndex: number; data: string }
  'setup:complete': { workspaceId: string; log: SetupLogEntry }
  'agentChat:chunk': { messageId: string; delta: string; done: boolean }
  'agentChat:toolCall': { messageId: string; toolCallId: string; name: AgentChatToolName; arguments: Record<string, unknown>; status: ToolCallStatus }
  'agentChat:toolCallUpdate': { toolCallId: string; status: ToolCallStatus; result?: unknown; error?: string }
  'voiceCommand:chunk': { messageId: string; delta: string; done: boolean }
  'voiceCommand:toolCall': { messageId: string; toolCallId: string; name: AgentChatToolName; arguments: Record<string, unknown>; status: ToolCallStatus }
  'voiceCommand:toolCallUpdate': { toolCallId: string; status: ToolCallStatus; result?: unknown; error?: string }
  'app:requestFlush': Record<string, never>
  'app:flushed': Record<string, never>
}

class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event as string, data)
  }
  override on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event as string, listener)
  }
  override off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event as string, listener)
  }
}

export const ee = new TypedEventEmitter()
// Prevent listener limit warnings — subscriptions may add many listeners
ee.setMaxListeners(100)
