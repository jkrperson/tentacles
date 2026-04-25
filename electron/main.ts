import { app, BrowserWindow, dialog, Menu, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { createIPCHandler } from 'electron-trpc/main'
import { PtyManager } from './ptyManager'
import { FileWatcher } from './fileWatcher'
import { GitManager } from './gitManager'
import { LspManager } from './lspManager'
import { DaemonClient } from './daemon/client'
import { removeScrollback } from './daemon/scrollback'
import { getScrollbackDir } from './daemon/launcher'
import { initUpdater, checkForUpdates, restartAndInstall } from './updater'
import { cleanupAllAdapters } from './agents/registry'
import { startHookServer, stopHookServer } from './hookServer'
import { startRendererServer } from './rendererServer'
import { HookManager } from './hookManager'
import { createAgentSpawner } from './agentSpawner'
import { wireEvents } from './eventWiring'
import { ee } from './trpc/events'
import { AuthManager } from './authManager'
import { createRouter } from './trpc/router'
import type { SessionStatus } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Raise macOS file descriptor limit
if (process.platform === 'darwin' || process.platform === 'linux') {
  try {
    const raw = execSync('ulimit -n', { encoding: 'utf-8', timeout: 2000 }).trim()
    const current = parseInt(raw, 10)
    if (current < 4096) {
      console.warn(`[tentacles] Low file descriptor limit: ${current}. Recommend running 'ulimit -n 10240' before launching.`)
    }
  } catch { /* ignore */ }
}

// Fix PATH when launched from Finder/desktop launcher
if ((process.platform === 'darwin' || process.platform === 'linux') && !process.env.VITE_DEV_SERVER_URL) {
  try {
    const shell = process.env.SHELL || '/bin/sh'
    const shellPath = execSync(`${shell} -ilc 'echo -n $PATH'`, { encoding: 'utf-8', timeout: 5000 })
    if (shellPath) process.env.PATH = shellPath
  } catch {
    // fall back to existing PATH
  }
}

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Use separate userData directory in dev to avoid clashing with the production app
if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(app.getPath('appData'), 'tentacles-dev'))
}

const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const sessionsPath = path.join(app.getPath('userData'), 'sessions.json')
const themesDir = path.join(app.getPath('userData'), 'themes')
const soundsDir = path.join(app.getPath('userData'), 'sounds')
const hooksDir = path.join(app.getPath('userData'), 'hooks')
const projectsConfigDir = path.join(app.getPath('userData'), 'projects')

let win: BrowserWindow | null = null
let rendererURL: string | undefined
const ptyManager = new PtyManager()
const fileWatcher = new FileWatcher()
const gitManager = new GitManager()
const lspManager = new LspManager()
const daemonClient = new DaemonClient()
const hookManager = new HookManager(hooksDir)

// Supabase config — safe to embed (anon key is a public key; RLS protects data)
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://zpzudtqcmxneuoisqhln.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_i4AnTvh73PiM---gfayXOQ_obe_VkKp'
const authManager = new AuthManager(SUPABASE_URL, SUPABASE_ANON_KEY, app.getPath('userData'))

// Agent chat key manager
import { AgentChatKeyManager } from './agentChat/keyManager'
const agentChatKeyManager = new AgentChatKeyManager(app.getPath('userData'))


function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

const themeBgMap: Record<string, string> = {
  obsidian: '#0e0e10',
  midnight: '#0b0d14',
  ember: '#110e0c',
  monokai: '#272822',
  dawn: '#faf8f5',
}

// Wire PTY/shell/file events to the typed event emitter
wireEvents({ ptyManager, fileWatcher, hookManager, loadSettings })

// Create agent spawner
const spawner = createAgentSpawner({
  ptyManager, hookManager, daemonClient, loadSettings, hooksDir,
})

// Create tRPC router
const appRouter = createRouter({
  ptyManager,
  fileWatcher,
  gitManager,
  lspManager,
  settingsPath,
  sessionsPath,
  themesDir,
  soundsDir,
  getWindow: () => win,
  checkForUpdates,
  restartAndInstall,
  spawnAgent: spawner.spawn,
  reattachAgent: spawner.reattach,
  daemonClient,
  authManager,
  projectsConfigDir,
  agentChatKeyManager,
})

let ipcHandler: ReturnType<typeof createIPCHandler> | null = null
let deferredDaemonMigrationTimer: ReturnType<typeof setInterval> | null = null
let deferredDaemonMigrationInFlight = false
const daemonSessionStatus = new Map<string, SessionStatus>()

function isIdleForMigration(status: SessionStatus | undefined): boolean {
  return status === 'idle' || status === 'completed' || status === 'errored'
}

async function maybeRunDeferredDaemonMigration() {
  if (deferredDaemonMigrationInFlight) return
  if (!daemonClient.hasPendingCompatibilityRestart()) {
    if (deferredDaemonMigrationTimer) {
      clearInterval(deferredDaemonMigrationTimer)
      deferredDaemonMigrationTimer = null
    }
    return
  }
  if (!daemonClient.isConnected()) return

  deferredDaemonMigrationInFlight = true
  try {
    const daemonSessions = await daemonClient.list()
    if (daemonSessions.length === 0) {
      const migrated = await daemonClient.migrateToCompatibleDaemon()
      if (migrated) {
        console.log('[daemon] Deferred compatibility migration completed (no active sessions)')
      }
      return
    }

    const allIdle = daemonSessions.every((s) => isIdleForMigration(daemonSessionStatus.get(s.id)))
    if (!allIdle) return

    console.log(`[daemon] All ${daemonSessions.length} active sessions are idle; migrating daemon in background`)
    for (const s of daemonSessions) {
      try {
        await daemonClient.kill(s.id)
      } catch {
        // best effort; migration still proceeds
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))

    const migrated = await daemonClient.migrateToCompatibleDaemon()
    if (migrated) {
      console.log('[daemon] Deferred compatibility migration completed')
    }
  } catch {
    // daemon temporarily unavailable; keep watcher running
  } finally {
    deferredDaemonMigrationInFlight = false
  }
}

function startDeferredDaemonMigrationWatcher() {
  if (!daemonClient.hasPendingCompatibilityRestart()) return
  if (deferredDaemonMigrationTimer) return

  deferredDaemonMigrationTimer = setInterval(() => {
    void maybeRunDeferredDaemonMigration()
  }, 5000)
  void maybeRunDeferredDaemonMigration()
}

ee.on('session:agentStatus', ({ id, status }) => {
  daemonSessionStatus.set(id, status)
  if (daemonClient.hasPendingCompatibilityRestart()) {
    void maybeRunDeferredDaemonMigration()
  }
})

ee.on('session:exit', ({ id, exitCode }) => {
  daemonSessionStatus.set(id, exitCode === 0 ? 'completed' : 'errored')
  if (daemonClient.hasPendingCompatibilityRestart()) {
    void maybeRunDeferredDaemonMigration()
  }
})

daemonClient.on('compatibilityDeferred', () => {
  startDeferredDaemonMigrationWatcher()
})

function createWindow() {
  const settings = loadSettings()
  const resolvedTheme = settings.theme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'obsidian' : 'dawn')
    : settings.theme
  let bgColor = themeBgMap[resolvedTheme] ?? '#0e0e10'

  if (typeof resolvedTheme === 'string' && resolvedTheme.startsWith('custom:')) {
    try {
      const fileName = resolvedTheme.replace(/^custom:/, '')
      const themeFile = JSON.parse(fs.readFileSync(path.join(themesDir, `${fileName}.json`), 'utf-8'))
      if (themeFile.colors?.bgBase) {
        bgColor = themeFile.colors.bgBase
      } else if (themeFile.base && themeBgMap[themeFile.base]) {
        bgColor = themeBgMap[themeFile.base]
      }
    } catch { /* Fall back to default */ }
  }

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: bgColor,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  win.webContents.on('will-navigate', (event, url) => {
    const baseURL = VITE_DEV_SERVER_URL ?? rendererURL ?? 'file://'
    if (!url.startsWith(baseURL)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (ipcHandler) {
    ipcHandler.attachWindow(win)
  }

  // Build application menu with accelerators for shortcuts that macOS would
  // otherwise intercept (e.g. Cmd+` is "switch window" at the OS level).
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'Control+`',
          click: () => {
            win?.webContents.executeJavaScript(
              `window.dispatchEvent(new CustomEvent('menu-shortcut', { detail: 'terminal.create' }))`
            )
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadURL(rendererURL!)
    initUpdater()
  }
}

// --- Lifecycle ---
let forceQuit = false

app.on('before-quit', (event) => {
  if (forceQuit) return

  // Only show confirmation if there are active sessions that would be killed
  if (!ptyManager.hasActiveSessions()) return

  event.preventDefault()

  const focusedWindow = BrowserWindow.getFocusedWindow() ?? win
  const choice = dialog.showMessageBoxSync(focusedWindow!, {
    type: 'question',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Quit Tentacles',
    message: 'Are you sure you want to quit?',
    detail: 'Any running sessions will be stopped.',
  })

  if (choice === 0) {
    forceQuit = true
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('will-quit', async () => {
  const daemonHookIds = hookManager.getDaemonHookIds()
  if (deferredDaemonMigrationTimer) {
    clearInterval(deferredDaemonMigrationTimer)
    deferredDaemonMigrationTimer = null
  }

  ptyManager.killAll()
  lspManager.stopAll()
  await fileWatcher.unwatch()

  cleanupAllAdapters()
  stopHookServer()
  hookManager.clear()
  daemonClient.disconnect()
  authManager.cleanup()
  hookManager.cleanupAllHookFiles(daemonHookIds)

  // Close todo database
  const { closeDb } = await import('./db/todoDb')
  closeDb()
})

app.whenReady().then(async () => {
  // Ensure project config directories exist
  fs.mkdirSync(path.join(projectsConfigDir, 'setup-logs'), { recursive: true })

  await startHookServer()

  if (!VITE_DEV_SERVER_URL) {
    rendererURL = await startRendererServer(RENDERER_DIST)
  }

  try {
    await daemonClient.ensureAndConnect()
    ptyManager.setDaemonClient(daemonClient)
    console.log('[tentacles] Connected to terminal daemon')
  } catch (err) {
    console.warn('[tentacles] Failed to connect to daemon, sessions will not persist:', err)
  }

  await reconcileSessions()
  startDeferredDaemonMigrationWatcher()

  // Clear the cached daemon session IDs after a short delay so that any
  // subsequent reattach calls (e.g. macOS window close/reopen) query the
  // daemon directly instead of relying on a stale startup snapshot.
  setTimeout(() => spawner.clearCachedDaemonSessionIds(), 15_000)

  // Prune ghost worktree entries left by crashes or manual cleanup
  gitManager.pruneAllWorktrees().catch((err: unknown) => {
    console.warn('[tentacles] Failed to prune worktrees on startup:', err)
  })

  ipcHandler = createIPCHandler({ router: appRouter })
  createWindow()
})

/** Reconcile persisted sessions with daemon state on startup. */
async function reconcileSessions() {
  const activeHookIds = new Set<string>()

  let daemonSessions: { id: string; pid: number; cwd: string; createdAt: number }[] = []
  if (daemonClient.isConnected()) {
    try {
      daemonSessions = await daemonClient.list()
    } catch { /* daemon not responding */ }
  }
  const daemonSessionIds = new Set(daemonSessions.map((s) => s.id))

  let persistedSessions: { hookId?: string; id?: string }[] = []
  try {
    const data = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    persistedSessions = data.sessions || []
    for (const s of persistedSessions) {
      if (s.hookId && daemonSessionIds.has(s.id!)) {
        activeHookIds.add(s.hookId)
      }
    }
  } catch { /* ignore */ }

  const persistedIds = new Set(persistedSessions.map((s) => s.id))
  for (const ds of daemonSessions) {
    if (!persistedIds.has(ds.id)) {
      try {
        await daemonClient.kill(ds.id)
        removeScrollback(path.join(getScrollbackDir(), ds.id))
      } catch { /* ignore */ }
    }
  }

  spawner.setCachedDaemonSessionIds(daemonSessionIds)
  hookManager.cleanupAllHookFiles(activeHookIds)
}
