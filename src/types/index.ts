export interface GitHubUser {
  id: string          // Supabase user ID
  login: string       // GitHub username
  avatarUrl: string   // GitHub avatar
  name: string | null // GitHub display name
}

export type SessionStatus = 'running' | 'needs_input' | 'completed' | 'idle' | 'errored'
export type AgentType = string

export type AgentIconKey = 'claude' | 'codex' | 'gemini' | 'cursor' | 'generic'

export interface AgentConfig {
  id: string
  name: string
  command: string
  icon: AgentIconKey
  enabled: boolean
  pinned: boolean
  /** Runtime-only — true if the command binary was found on PATH */
  installed?: boolean
}

export type WorkspaceType = 'main' | 'worktree'
export type WorkspaceStatus = 'active' | 'merged' | 'stale'

export interface Workspace {
  id: string
  projectId: string        // === Project.id (repo path)
  type: WorkspaceType
  branch: string
  worktreePath: string | null   // null for type === 'main'
  linkedPR?: string
  linkedIssue?: string
  status: WorkspaceStatus
  createdAt: number
  name: string             // display name: "main", "add-auth", etc.
}

export interface Session {
  id: string
  name: string
  cwd: string
  status: SessionStatus
  createdAt: number
  hasUnread: boolean
  agentType: AgentType
  workspaceId: string
  statusDetail?: string
  pid?: number
  exitCode?: number | null
  hookId?: string
  /** @deprecated Use workspaceId — kept for migration */
  isWorktree?: boolean
  /** @deprecated Use workspaceId — kept for migration */
  worktreePath?: string
  /** @deprecated Use workspaceId — kept for migration */
  worktreeBranch?: string
  /** @deprecated Use workspaceId — kept for migration */
  originalRepo?: string
}

export interface SessionsFile {
  sessions: Session[]
  activeSessionId: string | null
  tabOrder?: string[]
  workspaces?: Workspace[]
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

export interface FileDiffStat {
  filePath: string
  insertions: number
  deletions: number
  isBinary: boolean
}

export type GitPanelViewMode = 'flat' | 'tree' | 'grouped'

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
  openDiffs: DiffViewState[]
  selectedDiffPath: string | null
  gitDiffStats: Map<string, FileDiffStat>
}

export type TerminalStatus = 'running' | 'exited'

export interface ShellTerminal {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  createdAt: number
  workspaceId: string
  pid?: number
  exitCode?: number | null
}

export type { CustomThemeFile } from '../themes'

export type NotificationEvent = 'completed' | 'needsInput' | 'exited'

export interface NotificationSoundConfig {
  completed: string   // 'none', 'builtin:chime', 'builtin:ping', 'builtin:bell', or 'custom:filename'
  needsInput: string
  exited: string
}

export interface CustomSoundFile {
  key: string        // 'custom:filename.mp3'
  name: string       // display name (filename without extension)
  filename: string   // actual filename on disk
}

export interface DictationSettings {
  serverUrl: string
  autoInsert: boolean
  micDeviceId: string           // '' = system default
  micSensitivity: number        // 1–10, maps to silence threshold
  noiseSuppression: number      // 1–10, maps to cleanup aggressiveness
}

export interface DictationUsage {
  usedSeconds: number
  limitSeconds: number
  tier: string
  periodEnd: string
}

export interface AppSettings {
  maxSessions: number
  defaultProjectPath: string
  defaultAgent: AgentType
  agents: AgentConfig[]
  /** @deprecated Use agents[] — kept for migration */
  claudeCliPath?: string
  /** @deprecated Use agents[] — kept for migration */
  codexCliPath?: string
  /** @deprecated Use agents[] — kept for migration */
  opencodeCliPath?: string
  desktopNotifications: boolean
  soundEnabled: boolean
  notificationSounds: NotificationSoundConfig
  idleThresholdMs: number
  terminalFontSize: number
  terminalFontFamily: string
  projectPaths: string[]
  theme: string
  enabledLspLanguages: string[]
  scrollSpeed: number
  enableMediaPanel: boolean
  customKeybindings: Record<string, string>
  sidebarViewMode?: 'flat' | 'grouped'
  dictation: DictationSettings
  telemetryEnabled: boolean
}

export interface LspServerStatus {
  running: boolean
  port: number | null
}

export interface UpdaterStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'error'
  version?: string
  downloadUrl?: string
  releaseUrl?: string
  message?: string
}

export interface SetupScript {
  id: string
  command: string
  enabled: boolean
}

export interface ProjectConfig {
  projectPath: string
  setupScripts: SetupScript[]
}

export interface SetupLogEntry {
  workspaceId: string
  projectPath: string
  startedAt: number
  completedAt?: number
  scripts: Array<{
    command: string
    exitCode: number | null
    output: string
  }>
}

