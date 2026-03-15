export type SessionStatus = 'running' | 'needs_input' | 'completed' | 'idle' | 'errored'
export type AgentType = 'claude' | 'codex' | 'opencode'

export interface Session {
  id: string
  name: string
  cwd: string
  status: SessionStatus
  createdAt: number
  hasUnread: boolean
  agentType: AgentType
  statusDetail?: string
  pid?: number
  exitCode?: number | null
  isWorktree?: boolean
  worktreePath?: string
  worktreeBranch?: string
  originalRepo?: string
  hookId?: string
}

export interface SessionsFile {
  sessions: Session[]
  activeSessionId: string | null
}

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isExpanded?: boolean
}

export interface FileChangeEvent {
  eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  watchRoot: string
}

export interface Project {
  id: string        // same as path (directory path is the identity)
  path: string
  name: string      // basename of path
  addedAt: number
}

export type GitFileStatus = 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'conflicted'
export type GitIndexStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'none'
export type GitWorkTreeStatus = 'modified' | 'deleted' | 'untracked' | 'none'

export interface GitFileDetail {
  absolutePath: string
  status: GitFileStatus            // combined (compat)
  indexStatus: GitIndexStatus
  workTreeStatus: GitWorkTreeStatus
}

export interface GitStatusResult {
  branch: string
  files: Array<{ absolutePath: string; status: GitFileStatus }>
}

export interface GitStatusDetailResult {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileDetail[]
}

export interface DiffViewState {
  filePath: string
  staged: boolean
}

export interface GitBranchInfo {
  branches: string[]
  current: string
}

export interface ProjectFileTreeState {
  nodes: FileNode[]
  expandedPaths: Set<string>
  selectedFilePath: string | null
  openFiles: string[]
  recentlyChangedPaths: Set<string>
  gitStatuses: Map<string, GitFileStatus>
  gitDetailedFiles: GitFileDetail[]
  gitBranch: string
  gitUpstream: string | null
  gitAhead: number
  gitBehind: number
  activeDiff: DiffViewState | null
}

export type TerminalStatus = 'running' | 'exited'

export interface ShellTerminal {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  createdAt: number
  pid?: number
  exitCode?: number | null
}

export type { CustomThemeFile } from '../themes'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message?: string
  sessionId?: string
  createdAt: number
  duration: number
}

export interface AppSettings {
  maxSessions: number
  defaultProjectPath: string
  defaultAgent: AgentType
  claudeCliPath: string
  codexCliPath: string
  opencodeCliPath: string
  desktopNotifications: boolean
  soundEnabled: boolean
  idleThresholdMs: number
  terminalFontSize: number
  terminalFontFamily: string
  projectPaths: string[]
  theme: string
  enabledLspLanguages: string[]
  scrollSpeed: number
  enableMediaPanel: boolean
}

export interface LspServerStatus {
  running: boolean
  port: number | null
}

export interface UpdaterStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

