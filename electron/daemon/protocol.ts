// Shared message types for main ↔ daemon communication over Unix socket.
// Each message is a newline-delimited JSON object.

import type { SessionStatus } from '../../src/types'

export const DAEMON_PROTOCOL_VERSION = '2.0.0'
export const DAEMON_REQUIRED_CAPABILITIES = [
  'spawn',
  'write',
  'resize',
  'kill',
  'list',
  'getScrollback',
  'ping',
  'setSessionStatus',
  'renameSession',
  'event:data',
  'event:exit',
  'event:sessionsChanged',
  'sessionMetadata:v2',
] as const
export type DaemonCapability = typeof DAEMON_REQUIRED_CAPABILITIES[number]

export interface SessionMetadata {
  name: string
  agentType: string
  workspaceId: string
  hookId: string | null
}

export interface SpawnRequest {
  method: 'spawn'
  id: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  metadata: SessionMetadata
}

export interface WriteRequest { method: 'write'; id: string; data: string }
export interface ResizeRequest { method: 'resize'; id: string; cols: number; rows: number }
export interface KillRequest { method: 'kill'; id: string }
export interface ListRequest { method: 'list' }
export interface GetScrollbackRequest { method: 'getScrollback'; id: string }
export interface PingRequest { method: 'ping' }
export interface SetSessionStatusRequest {
  method: 'setSessionStatus'
  id: string
  status: SessionStatus
  exitCode?: number | null
}
export interface RenameSessionRequest { method: 'renameSession'; id: string; name: string }

export type DaemonRequest =
  | SpawnRequest | WriteRequest | ResizeRequest | KillRequest
  | ListRequest | GetScrollbackRequest | PingRequest
  | SetSessionStatusRequest | RenameSessionRequest

export interface SpawnResponse { ok: true; reqId: string; pid: number }
export interface WriteResponse { ok: true; reqId: string }
export interface ResizeResponse { ok: true; reqId: string }
export interface KillResponse { ok: true; reqId: string }

export interface ListSession {
  id: string
  pid: number
  cwd: string
  createdAt: number
  name: string
  agentType: string
  workspaceId: string
  hookId: string | null
  status: SessionStatus
  exitCode: number | null
}
export interface ListResponse { ok: true; reqId: string; sessions: ListSession[] }

export interface GetScrollbackResponse { ok: true; reqId: string; data: string }
export interface PingResponse {
  ok: true; reqId: string; uptime: number
  protocolVersion?: string; capabilities?: string[]
}
export interface SetSessionStatusResponse { ok: true; reqId: string }
export interface RenameSessionResponse { ok: true; reqId: string }
export interface ErrorResponse { ok: false; reqId: string; error: string }

export type DaemonResponse =
  | SpawnResponse | WriteResponse | ResizeResponse | KillResponse
  | ListResponse | GetScrollbackResponse | PingResponse
  | SetSessionStatusResponse | RenameSessionResponse | ErrorResponse

export interface DataEvent { event: 'data'; id: string; data: string }
export interface ExitEvent { event: 'exit'; id: string; exitCode: number }
export interface SessionsChangedEvent { event: 'sessionsChanged' }

export type DaemonEvent = DataEvent | ExitEvent | SessionsChangedEvent

export interface TaggedRequest { reqId: string; request: DaemonRequest }
