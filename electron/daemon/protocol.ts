// Shared message types for main ↔ daemon communication over Unix socket.
// Each message is a newline-delimited JSON object.

import type { SessionStatus } from '../../src/types'

export const DAEMON_PROTOCOL_VERSION = '3.0.0'
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
  'listProjects',
  'addProject',
  'updateProject',
  'removeProject',
  'reorderProjects',
  'listWorkspaces',
  'addWorkspace',
  'updateWorkspace',
  'removeWorkspace',
  'reorderWorkspaces',
  'event:data',
  'event:exit',
  'event:sessionsChanged',
  'event:projectsChanged',
  'event:workspacesChanged',
  'sessionMetadata:v2',
  'projectsWorkspaces:v3',
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

// --- Project requests (v3) ---

export interface ProjectMetadata {
  path: string
  name: string
  color: string
  icon: string | null
}

export interface ListProjectsRequest { method: 'listProjects' }
export interface AddProjectRequest {
  method: 'addProject'
  id: string
  metadata: ProjectMetadata
  sortOrder: number
}
export interface UpdateProjectRequest {
  method: 'updateProject'
  id: string
  patch: { name?: string; color?: string; icon?: string | null }
}
export interface RemoveProjectRequest { method: 'removeProject'; id: string }
export interface ReorderProjectsRequest { method: 'reorderProjects'; idsInOrder: string[] }

// --- Workspace requests (v3) ---

export type WorkspaceType = 'main' | 'worktree'
export type WorkspaceStatus = 'active' | 'merged' | 'stale' | 'tearing_down'

export interface WorkspaceMetadata {
  projectId: string
  type: WorkspaceType
  branch: string
  worktreePath: string | null
  linkedPr: string | null
  linkedIssue: string | null
  status: WorkspaceStatus
  name: string
}

export interface ListWorkspacesRequest { method: 'listWorkspaces'; projectId?: string }
export interface AddWorkspaceRequest {
  method: 'addWorkspace'
  id: string
  metadata: WorkspaceMetadata
  sortOrder: number
}
export interface UpdateWorkspaceRequest {
  method: 'updateWorkspace'
  id: string
  patch: {
    branch?: string
    worktreePath?: string | null
    linkedPr?: string | null
    linkedIssue?: string | null
    status?: WorkspaceStatus
    name?: string
  }
}
export interface RemoveWorkspaceRequest { method: 'removeWorkspace'; id: string }
export interface ReorderWorkspacesRequest {
  method: 'reorderWorkspaces'
  projectId: string
  idsInOrder: string[]
}

export type DaemonRequest =
  | SpawnRequest | WriteRequest | ResizeRequest | KillRequest
  | ListRequest | GetScrollbackRequest | PingRequest
  | SetSessionStatusRequest | RenameSessionRequest
  | ListProjectsRequest | AddProjectRequest | UpdateProjectRequest | RemoveProjectRequest | ReorderProjectsRequest
  | ListWorkspacesRequest | AddWorkspaceRequest | UpdateWorkspaceRequest | RemoveWorkspaceRequest | ReorderWorkspacesRequest

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

export interface ListedProject {
  id: string
  path: string
  name: string
  color: string
  icon: string | null
  addedAt: number
  sortOrder: number
}
export interface ListProjectsResponse { ok: true; reqId: string; projects: ListedProject[] }

export interface ListedWorkspace {
  id: string
  projectId: string
  type: WorkspaceType
  branch: string
  worktreePath: string | null
  linkedPr: string | null
  linkedIssue: string | null
  status: WorkspaceStatus
  name: string
  createdAt: number
  sortOrder: number
}
export interface ListWorkspacesResponse { ok: true; reqId: string; workspaces: ListedWorkspace[] }

export interface AddProjectResponse { ok: true; reqId: string }
export interface UpdateProjectResponse { ok: true; reqId: string }
export interface RemoveProjectResponse { ok: true; reqId: string }
export interface ReorderProjectsResponse { ok: true; reqId: string }
export interface AddWorkspaceResponse { ok: true; reqId: string }
export interface UpdateWorkspaceResponse { ok: true; reqId: string }
export interface RemoveWorkspaceResponse { ok: true; reqId: string }
export interface ReorderWorkspacesResponse { ok: true; reqId: string }

export type DaemonResponse =
  | SpawnResponse | WriteResponse | ResizeResponse | KillResponse
  | ListResponse | GetScrollbackResponse | PingResponse
  | SetSessionStatusResponse | RenameSessionResponse
  | ListProjectsResponse | AddProjectResponse | UpdateProjectResponse | RemoveProjectResponse | ReorderProjectsResponse
  | ListWorkspacesResponse | AddWorkspaceResponse | UpdateWorkspaceResponse | RemoveWorkspaceResponse | ReorderWorkspacesResponse
  | ErrorResponse

export interface DataEvent { event: 'data'; id: string; data: string }
export interface ExitEvent { event: 'exit'; id: string; exitCode: number }
export interface SessionsChangedEvent { event: 'sessionsChanged' }
export interface ProjectsChangedEvent { event: 'projectsChanged' }
export interface WorkspacesChangedEvent { event: 'workspacesChanged' }

export type DaemonEvent = DataEvent | ExitEvent | SessionsChangedEvent | ProjectsChangedEvent | WorkspacesChangedEvent

export interface TaggedRequest { reqId: string; request: DaemonRequest }
