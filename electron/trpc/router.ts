import * as fs from 'node:fs'
import { BrowserWindow } from 'electron'
import { t } from './trpc'
import { createSessionRouter } from './routers/session'
import { createTerminalRouter } from './routers/terminal'
import { createFileRouter } from './routers/file'
import { createGitRouter } from './routers/git'
import { createDialogRouter } from './routers/dialog'
import { createLspRouter } from './routers/lsp'
import { createUpdaterRouter } from './routers/updater'
import { createAppRouter } from './routers/app'
import { createAuthRouter } from './routers/auth'
import { createProjectConfigRouter } from './routers/projectConfig'
import { createDictationRouter } from './routers/dictation'
import { createTodoRouter } from './routers/todo'
import { createAgentChatRouter } from './routers/agentChat'
import type { PtyManager } from '../ptyManager'
import type { FileWatcher } from '../fileWatcher'
import type { GitManager } from '../gitManager'
import type { LspManager } from '../lspManager'
import type { DaemonClient } from '../daemon/client'
import type { AgentType } from '../agents/types'
import type { SessionStatus } from '../../src/types'
import type { AuthManager } from '../authManager'
import type { AgentChatKeyManager } from '../agentChat/keyManager'

export interface RouterDeps {
  ptyManager: PtyManager
  fileWatcher: FileWatcher
  gitManager: GitManager
  lspManager: LspManager
  settingsPath: string
  sessionsPath: string
  themesDir: string
  soundsDir: string
  projectsConfigDir: string
  getWindow: () => BrowserWindow | null
  checkForUpdates: () => Promise<void>
  spawnAgent: (name: string, cwd: string, agentType: AgentType, resumeId?: string) => Promise<{ id: string; pid: number; hookId: string }>
  reattachAgent: (sessionId: string, hookId: string, name: string, cwd: string, agentType?: AgentType) => Promise<{ id: string; scrollbackAvailable: boolean; initialStatus?: SessionStatus; initialStatusDetail?: string | null; recoveredClaudeSessionId?: string } | null>
  daemonClient: DaemonClient
  authManager: AuthManager
  agentChatKeyManager: AgentChatKeyManager
}

export function createRouter(deps: RouterDeps) {
  return t.router({
    session: createSessionRouter({
      ptyManager: deps.ptyManager,
      spawnAgent: deps.spawnAgent,
      reattachAgent: deps.reattachAgent,
      daemonClient: deps.daemonClient,
    }),
    terminal: createTerminalRouter({
      ptyManager: deps.ptyManager,
    }),
    file: createFileRouter({
      fileWatcher: deps.fileWatcher,
    }),
    git: createGitRouter({
      gitManager: deps.gitManager,
    }),
    dialog: createDialogRouter({
      getWindow: deps.getWindow,
    }),
    lsp: createLspRouter({
      lspManager: deps.lspManager,
    }),
    updater: createUpdaterRouter({
      checkForUpdates: deps.checkForUpdates,
    }),
    auth: createAuthRouter({
      authManager: deps.authManager,
    }),
    app: createAppRouter({
      settingsPath: deps.settingsPath,
      sessionsPath: deps.sessionsPath,
      themesDir: deps.themesDir,
      soundsDir: deps.soundsDir,
      getWindow: deps.getWindow,
    }),
    projectConfig: createProjectConfigRouter({
      projectsConfigDir: deps.projectsConfigDir,
    }),
    todo: createTodoRouter(),
    dictation: createDictationRouter({
      authManager: deps.authManager,
      getServerUrl: () => {
        // Both dev and prod hit the deployed STT service. Running it locally
        // requires Bun + ffmpeg installed and isn't worth the friction for
        // most contributors — set settings.dictation.serverUrl explicitly if
        // you want to point at http://localhost:3001 during local server dev.
        const defaultUrl = 'https://stt.tentacles.sh'
        try {
          const raw = fs.readFileSync(deps.settingsPath, 'utf-8')
          const settings = JSON.parse(raw)
          return settings.dictation?.serverUrl || defaultUrl
        } catch {
          return defaultUrl
        }
      },
    }),
    agentChat: createAgentChatRouter({
      keyManager: deps.agentChatKeyManager,
      settingsPath: deps.settingsPath,
      sessionsPath: deps.sessionsPath,
      ptyManager: deps.ptyManager,
      spawnAgent: deps.spawnAgent,
    }),
  })
}

export type AppRouter = ReturnType<typeof createRouter>
