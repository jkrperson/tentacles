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
import type { PtyManager } from '../ptyManager'
import type { FileWatcher } from '../fileWatcher'
import type { GitManager } from '../gitManager'
import type { LspManager } from '../lspManager'
import type { DaemonClient } from '../daemon/client'
import type { AgentType } from '../agents/types'
import type { SessionStatus } from '../../src/types'
import type { autoUpdater as AutoUpdaterType } from 'electron-updater'

export interface RouterDeps {
  ptyManager: PtyManager
  fileWatcher: FileWatcher
  gitManager: GitManager
  lspManager: LspManager
  settingsPath: string
  sessionsPath: string
  themesDir: string
  getWindow: () => BrowserWindow | null
  getAutoUpdater: () => typeof AutoUpdaterType | null
  spawnAgent: (name: string, cwd: string, agentType: AgentType, resumeId?: string) => Promise<{ id: string; pid: number; hookId: string }>
  reattachAgent: (sessionId: string, hookId: string, name: string, cwd: string, agentType?: AgentType) => Promise<{ id: string; scrollbackAvailable: boolean; initialStatus?: SessionStatus; initialStatusDetail?: string | null; recoveredClaudeSessionId?: string } | null>
  daemonClient: DaemonClient
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
      getAutoUpdater: deps.getAutoUpdater,
    }),
    app: createAppRouter({
      settingsPath: deps.settingsPath,
      sessionsPath: deps.sessionsPath,
      themesDir: deps.themesDir,
    }),
  })
}

export type AppRouter = ReturnType<typeof createRouter>
