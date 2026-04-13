// Shared message types for main ↔ daemon communication over Unix socket.
// Each message is a newline-delimited JSON object.

export const DAEMON_PROTOCOL_VERSION = '1.0.0'
export const DAEMON_REQUIRED_CAPABILITIES = [
  'spawn',
  'write',
  'resize',
  'kill',
  'list',
  'getScrollback',
  'ping',
  'event:data',
  'event:exit',
] as const
export type DaemonCapability = typeof DAEMON_REQUIRED_CAPABILITIES[number]

export interface SpawnRequest {
  method: 'spawn'
  id: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
}

export interface WriteRequest {
  method: 'write'
  id: string
  data: string
}

export interface ResizeRequest {
  method: 'resize'
  id: string
  cols: number
  rows: number
}

export interface KillRequest {
  method: 'kill'
  id: string
}

export interface ListRequest {
  method: 'list'
}

export interface GetScrollbackRequest {
  method: 'getScrollback'
  id: string
}

export interface PingRequest {
  method: 'ping'
}

export type DaemonRequest =
  | SpawnRequest
  | WriteRequest
  | ResizeRequest
  | KillRequest
  | ListRequest
  | GetScrollbackRequest
  | PingRequest

// Responses — each carries the `reqId` of the request it answers.

export interface SpawnResponse {
  ok: true
  reqId: string
  pid: number
}

export interface WriteResponse {
  ok: true
  reqId: string
}

export interface ResizeResponse {
  ok: true
  reqId: string
}

export interface KillResponse {
  ok: true
  reqId: string
}

export interface ListSession {
  id: string
  pid: number
  cwd: string
  createdAt: number
}

export interface ListResponse {
  ok: true
  reqId: string
  sessions: ListSession[]
}

export interface GetScrollbackResponse {
  ok: true
  reqId: string
  data: string
}

export interface PingResponse {
  ok: true
  reqId: string
  uptime: number
  protocolVersion?: string
  capabilities?: string[]
}

export interface ErrorResponse {
  ok: false
  reqId: string
  error: string
}

export type DaemonResponse =
  | SpawnResponse
  | WriteResponse
  | ResizeResponse
  | KillResponse
  | ListResponse
  | GetScrollbackResponse
  | PingResponse
  | ErrorResponse

// Events (daemon → client), pushed without a request.

export interface DataEvent {
  event: 'data'
  id: string
  data: string
}

export interface ExitEvent {
  event: 'exit'
  id: string
  exitCode: number
}

export type DaemonEvent = DataEvent | ExitEvent

// Wire format: each line is either a DaemonResponse or a DaemonEvent (from daemon)
// or a tagged DaemonRequest (from client).
export interface TaggedRequest {
  reqId: string
  request: DaemonRequest
}
