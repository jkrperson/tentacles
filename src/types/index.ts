export type SessionStatus = 'running' | 'idle' | 'completed' | 'errored'

export interface Session {
  id: string
  name: string
  cwd: string
  status: SessionStatus
  createdAt: number
  hasUnread: boolean
  claudeSessionId?: string
  statusDetail?: string
  archivedAt?: number
  pid?: number
  exitCode?: number | null
  isWorktree?: boolean
  worktreePath?: string
  worktreeBranch?: string
  originalRepo?: string
}

export interface SessionsFile {
  sessions: Session[]
  archived: Session[]
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

export interface GitStatusResult {
  branch: string
  files: Array<{ absolutePath: string; status: GitFileStatus }>
}

export interface ProjectFileTreeState {
  nodes: FileNode[]
  expandedPaths: Set<string>
  selectedFilePath: string | null
  openFiles: string[]
  recentlyChangedPaths: Set<string>
  gitStatuses: Map<string, GitFileStatus>
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
  claudeCliPath: string
  desktopNotifications: boolean
  soundEnabled: boolean
  idleThresholdMs: number
  terminalFontSize: number
  terminalFontFamily: string
  projectPaths: string[]
  theme: string
  enabledLspLanguages: string[]
}

export interface LspServerStatus {
  running: boolean
  port: number | null
}

export interface ElectronAPI {
  lsp: {
    start: (languageId: string, projectRoot: string) => Promise<{ port: number }>
    stop: (languageId: string, projectRoot: string) => Promise<void>
    status: (languageId: string, projectRoot: string) => Promise<LspServerStatus>
    listAvailable: () => Promise<Record<string, boolean>>
  }
  session: {
    create: (name: string, cwd: string) => Promise<{ id: string; pid: number }>
    resume: (claudeSessionId: string, name: string, cwd: string) => Promise<{ id: string; pid: number }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    list: () => Promise<Array<{ id: string; pid: number; name: string; cwd: string }>>
    onData: (cb: (data: { id: string; data: string }) => void) => () => void
    onExit: (cb: (data: { id: string; exitCode: number }) => void) => () => void
    onTitle: (cb: (data: { id: string; title: string }) => void) => () => void
    onClaudeSessionId: (cb: (data: { id: string; claudeSessionId: string }) => void) => () => void
    onStatusDetail: (cb: (data: { id: string; detail: string | null }) => void) => () => void
  }
  file: {
    readDir: (dirPath: string) => Promise<FileNode[]>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
    watch: (dirPath: string) => Promise<void>
    unwatchDir: (dirPath: string) => Promise<void>
    unwatch: () => Promise<void>
    onChanged: (cb: (event: FileChangeEvent) => void) => () => void
  }
  terminal: {
    create: (name: string, cwd: string) => Promise<{ id: string; pid: number }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (cb: (data: { id: string; data: string }) => void) => () => void
    onExit: (cb: (data: { id: string; exitCode: number }) => void) => () => void
  }
  git: {
    isRepo: (dirPath: string) => Promise<boolean>
    status: (dirPath: string) => Promise<GitStatusResult>
    worktree: {
      create: (repoPath: string, name?: string) => Promise<{ worktreePath: string; branch: string }>
      remove: (repoPath: string, worktreePath: string) => Promise<void>
      list: (repoPath: string) => Promise<WorktreeInfo[]>
    }
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
  app: {
    getSettings: () => Promise<AppSettings>
    saveSettings: (settings: AppSettings) => Promise<void>
    getPlatform: () => Promise<string>
    getHomePath: () => Promise<string>
    loadSessions: () => Promise<SessionsFile>
    saveSessions: (data: SessionsFile) => Promise<void>
  }
}
