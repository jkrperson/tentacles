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
import type { AgentType } from '../agents/types'
import type { autoUpdater as AutoUpdaterType } from 'electron-updater'

export interface RouterDeps {
  ptyManager: PtyManager
  fileWatcher: FileWatcher
  gitManager: GitManager
  lspManager: LspManager
  settingsPath: string
  sessionsPath: string
  getWindow: () => BrowserWindow | null
  getAutoUpdater: () => typeof AutoUpdaterType | null
  spawnAgent: (name: string, cwd: string, agentType: AgentType, resumeId?: string) => { id: string; pid: number; tmuxSessionName?: string; hookId: string }
  reattachAgent: (tmuxSessionName: string, hookId: string, name: string, cwd: string, agentType?: AgentType) => { id: string; pid: number; tmuxSessionName: string; paneTitle?: string; initialStatusDetail?: string | null; recoveredClaudeSessionId?: string } | null
}

export function createRouter(deps: RouterDeps) {
  return t.router({
    session: createSessionRouter({
      ptyManager: deps.ptyManager,
      spawnAgent: deps.spawnAgent,
      reattachAgent: deps.reattachAgent,
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
    }),
  })
}

export type AppRouter = ReturnType<typeof createRouter>
