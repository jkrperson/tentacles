import { app, BrowserWindow, Notification, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as http from 'node:http'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createIPCHandler } from 'electron-trpc/main'
import { PtyManager } from './ptyManager'
import { FileWatcher } from './fileWatcher'
import { GitManager } from './gitManager'
import { LspManager } from './lspManager'
import { DaemonClient } from './daemon/client'
import { removeScrollback } from './daemon/scrollback'
import { getScrollbackDir } from './daemon/launcher'
import { initAutoUpdater, autoUpdater } from './updater'
import { getAdapter } from './agents/registry'
import { cleanupCodexConfig } from './agents/codex'
import { cleanupOpencodeConfig } from './agents/opencode'
import { startHookServer, stopHookServer, registerHookSession, unregisterHookSession, getHookPort, getLastEvent } from './hookServer'
import { ee } from './trpc/events'
import { createRouter } from './trpc/router'
import type { AgentType } from './agents/types'
import type { SessionStatus } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Raise macOS file descriptor limit — GUI apps launched from Finder default to 256,
// which is easily exhausted by PTYs + file watchers + child processes.
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

// In production, serve renderer files over HTTP so third-party embeds (YouTube, Twitch)
// see a real http://localhost origin. file:// has a null origin which breaks embeds.
let rendererURL: string | undefined

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.map': 'application/json',
}

function startRendererServer(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = new URL(req.url || '/', 'http://localhost').pathname
      const filePath = path.join(root, decodeURIComponent(urlPath))

      const isAsset = path.extname(filePath) && fs.existsSync(filePath)
      const resolved = isAsset ? filePath : path.join(root, 'index.html')

      try {
        const content = fs.readFileSync(resolved)
        const ext = path.extname(resolved)
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(0, 'localhost', () => {
      const addr = server.address() as { port: number }
      resolve(`http://localhost:${addr.port}`)
    })
    server.on('error', reject)
  })
}

const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const sessionsPath = path.join(app.getPath('userData'), 'sessions.json')
const themesDir = path.join(app.getPath('userData'), 'themes')

let win: BrowserWindow | null = null
const ptyManager = new PtyManager()
const fileWatcher = new FileWatcher()
const gitManager = new GitManager()
const lspManager = new LspManager()
const daemonClient = new DaemonClient()

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

let ipcHandler: ReturnType<typeof createIPCHandler> | null = null

function createWindow() {
  const settings = loadSettings()
  const resolvedTheme = settings.theme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'obsidian' : 'dawn')
    : settings.theme
  let bgColor = themeBgMap[resolvedTheme] ?? '#0e0e10'

  // Resolve custom theme bg color
  if (typeof resolvedTheme === 'string' && resolvedTheme.startsWith('custom:')) {
    try {
      const fileName = resolvedTheme.replace(/^custom:/, '')
      const themeFile = JSON.parse(fs.readFileSync(path.join(themesDir, `${fileName}.json`), 'utf-8'))
      if (themeFile.colors?.bgBase) {
        bgColor = themeFile.colors.bgBase
      } else if (themeFile.base && themeBgMap[themeFile.base]) {
        bgColor = themeBgMap[themeFile.base]
      }
    } catch {
      // Fall back to default
    }
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

  // Open external links in the default browser instead of in-app
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

  // Attach tRPC IPC handler to this window
  if (ipcHandler) {
    ipcHandler.attachWindow(win)
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadURL(rendererURL!)
    initAutoUpdater()
  }
}

// --- PTY events → event emitter ---
ptyManager.onData((id, data) => {
  ee.emit('session:data', { id, data })
})

const lastTitleStatus = new Map<string, string>()

ptyManager.onTitle((id, title) => {
  ee.emit('session:title', { id, title })

  // Debug: log raw title and codepoints to main process console
  const codepoints = [...title].map((c) => 'U+' + (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0'))
  console.log(`[title] id=${id.slice(0, 8)} chars=[${codepoints.join(', ')}] raw="${title}"`)

  // Determine which adapter owns this session (if tracked via hooks)
  const hookInfo = sessionHookMap.get(id)
  const agentType: AgentType = hookInfo?.agentType ?? 'claude'
  const adapter = getAdapter(agentType)

  // Use adapter to parse title for status
  const parsed = adapter.parseTitle?.(title)
  if (parsed) {
    const prev = lastTitleStatus.get(id)
    lastTitleStatus.set(id, parsed.status)

    // Emit agentStatus from title changes (supplements hook server events)
    if (parsed.status !== prev) {
      ee.emit('session:agentStatus', { id, status: parsed.status })
    }

    // Desktop notification when agent transitions to idle
    if (parsed.status === 'idle' && prev !== 'idle') {
      const settings = loadSettings()
      if (settings.desktopNotifications !== false && Notification.isSupported()) {
        const displayName = parsed.name || 'Agent'
        new Notification({
          title: `${displayName} is waiting`,
          body: `${adapter.name} is waiting for input`,
        }).show()
      }
    }
  }
})

ptyManager.onExit((id, exitCode) => {
  lastTitleStatus.delete(id)

  // Clean up hook resources for this session
  const hookInfo = sessionHookMap.get(id)
  if (hookInfo) {
    unregisterHookSession(hookInfo.hookId)
    hookInfo.hookCleanup?.()
    cleanupHookFiles(hookInfo.hookId)
    sessionHookMap.delete(id)
  }

  // Clear statusDetail before sending exit
  ee.emit('session:statusDetail', { id, detail: null })
  ee.emit('session:exit', { id, exitCode })

  const settings = loadSettings()
  if (settings.desktopNotifications !== false && Notification.isSupported()) {
    new Notification({
      title: 'Session ended',
      body: `Agent session exited with code ${exitCode}`,
    }).show()
  }
})

// --- Hook infrastructure ---
const hooksDir = path.join(app.getPath('userData'), 'hooks')

function cleanupHookFiles(hookId: string) {
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.json`)) } catch { /* already deleted */ }
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.out`)) } catch { /* already deleted */ }
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.status`)) } catch { /* already deleted */ }
}

// Track hook resources per PTY session for cleanup.
const sessionHookMap = new Map<string, { hookId: string; agentType: AgentType; hookCleanup?: () => void }>()

/** Remove hook files in the hooks directory, optionally preserving specific hookIds. */
function cleanupAllHookFiles(preserve = new Set<string>()) {
  try {
    if (!fs.existsSync(hooksDir)) return
    for (const file of fs.readdirSync(hooksDir)) {
      const hookId = file.replace(/\.(json|out|status)$/, '')
      if (!preserve.has(hookId)) {
        try { fs.unlinkSync(path.join(hooksDir, file)) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

async function spawnAgent(name: string, cwd: string, agentType: AgentType, resumeId?: string): Promise<{ id: string; pid: number; hookId: string }> {
  const settings = loadSettings()
  const adapter = getAdapter(agentType)
  // Parse the CLI setting as a full command (e.g. "claude --dangerously-skip-permissions")
  const rawCommand = ((settings[adapter.settingsKey] as string) || adapter.defaultBinary).trim()
  const commandParts = rawCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [rawCommand]
  const binaryPath = commandParts[0]
  const userArgs = commandParts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))
  const hookId = randomUUID()
  const hookPort = getHookPort()

  // Set up hooks if the adapter supports them
  const hookSetup = adapter.setupHooks?.(hookId, hookPort) ?? null
  const extraArgs = hookSetup?.extraArgs ?? []

  // Build spawn config via adapter
  const spawnConfig = adapter.buildSpawnConfig({
    binaryPath,
    cwd,
    resumeId,
    extraArgs: [...userArgs, ...extraArgs],
  })

  // Merge hook env into spawn config env
  const mergedEnv = { ...spawnConfig.env, ...hookSetup?.env }
  const hasEnv = Object.keys(mergedEnv).length > 0

  const result = await ptyManager.create(name, spawnConfig.cwd, spawnConfig.command, spawnConfig.args, hasEnv ? mergedEnv : undefined)

  // Register with hook server for instant HTTP event delivery
  if (hookSetup) {
    registerHookSession(hookId, result.id, agentType)
    sessionHookMap.set(result.id, { hookId, agentType, hookCleanup: hookSetup.cleanup })
  }

  return { id: result.id, pid: result.pid, hookId }
}

// Cache daemon session IDs to avoid per-session round-trips during reattach.
// Populated by reconcileSessions(), cleared after loadSessions finishes.
let cachedDaemonSessionIds: Set<string> | null = null

/** Reattach to a daemon-managed session that survived an app restart.
 *  Returns null if the session is not alive in the daemon. */
async function reattachAgent(sessionId: string, hookId: string, _name: string, _cwd: string, agentType?: AgentType): Promise<{ id: string; scrollbackAvailable: boolean; initialStatus?: SessionStatus; initialStatusDetail?: string | null; recoveredClaudeSessionId?: string } | null> {
  // Verify the session is actually alive in the daemon
  if (!daemonClient.isConnected()) return null

  // Use cached list if available, otherwise query the daemon
  let alive: boolean
  if (cachedDaemonSessionIds) {
    alive = cachedDaemonSessionIds.has(sessionId)
  } else {
    try {
      const daemonSessions = await daemonClient.list()
      alive = daemonSessions.some((s) => s.id === sessionId)
    } catch {
      return null
    }
  }
  if (!alive) return null

  const resolvedAgentType: AgentType = agentType ?? 'claude'
  const adapter = getAdapter(resolvedAgentType)

  // Register the daemon session with ptyManager so events route correctly
  ptyManager.registerDaemonSession(sessionId)

  // Register with hook server
  if (hookId) {
    registerHookSession(hookId, sessionId, resolvedAgentType)
    sessionHookMap.set(sessionId, { hookId, agentType: resolvedAgentType })
  }

  // Try to recover status from hook events
  let initialStatusDetail: string | null = null
  let initialStatus: SessionStatus | undefined
  let lastHookEvent: unknown | null = null

  if (hookId) {
    lastHookEvent = getLastEvent(hookId)
    if (!lastHookEvent) {
      try {
        const statusPath = path.join(hooksDir, `${hookId}.status`)
        const raw = fs.readFileSync(statusPath, 'utf-8').trim()
        if (raw) lastHookEvent = JSON.parse(raw)
      } catch { /* file missing or malformed */ }
    }
    if (lastHookEvent) {
      initialStatusDetail = adapter.parseStatusDetail?.(lastHookEvent) ?? null
      const hookStatus = adapter.parseStatus?.(lastHookEvent) ?? null
      if (hookStatus) initialStatus = hookStatus
    }
  }

  // Try recovering claudeSessionId from .out file
  let recoveredClaudeSessionId: string | undefined
  if (hookId && adapter.parseSessionId) {
    try {
      const outputPath = path.join(hooksDir, `${hookId}.out`)
      if (fs.existsSync(outputPath)) {
        const raw = fs.readFileSync(outputPath, 'utf-8').trim()
        if (raw) {
          const parsed = JSON.parse(raw)
          recoveredClaudeSessionId = adapter.parseSessionId(parsed) ?? undefined
        }
      }
    } catch { /* file missing or malformed */ }
  }

  return {
    id: sessionId,
    scrollbackAvailable: true,
    initialStatus,
    initialStatusDetail,
    recoveredClaudeSessionId,
  }
}

// --- Terminal (shell) events → event emitter ---
ptyManager.onShellData((id, data) => {
  ee.emit('terminal:data', { id, data })
})

ptyManager.onShellExit((id, exitCode) => {
  ee.emit('terminal:exit', { id, exitCode })
})

// --- File events → event emitter ---
fileWatcher.onChanged((eventType, filePath, watchRoot) => {
  ee.emit('file:changed', { eventType: eventType as 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', path: filePath, watchRoot })
})

// --- Create tRPC router ---
const appRouter = createRouter({
  ptyManager,
  fileWatcher,
  gitManager,
  lspManager,
  settingsPath,
  sessionsPath,
  themesDir,
  getWindow: () => win,
  getAutoUpdater: () => autoUpdater,
  spawnAgent,
  reattachAgent,
  daemonClient,
})

// --- Lifecycle ---
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
  // Collect hookIds for daemon-managed sessions BEFORE killing local PTYs
  const daemonHookIds = new Set<string>()
  for (const [, info] of sessionHookMap) {
    if (info.hookId) {
      daemonHookIds.add(info.hookId)
    }
  }

  // Kill only local PTYs (shells) — daemon sessions survive
  ptyManager.killAll()
  lspManager.stopAll()
  await fileWatcher.unwatch()

  // Restore agent config files
  cleanupCodexConfig()
  cleanupOpencodeConfig()

  // Stop the hook server
  stopHookServer()
  sessionHookMap.clear()

  // Disconnect from daemon (don't kill it — sessions survive)
  daemonClient.disconnect()

  // Clean up hook files, preserving those for daemon-managed sessions
  cleanupAllHookFiles(daemonHookIds)
})

app.whenReady().then(async () => {
  // Start hook server for instant hook event delivery from agents
  await startHookServer()

  // Start local HTTP server for production so embeds see a real http:// origin
  if (!VITE_DEV_SERVER_URL) {
    rendererURL = await startRendererServer(RENDERER_DIST)
  }

  // Connect to daemon (launches if not running)
  try {
    await daemonClient.ensureAndConnect()
    ptyManager.setDaemonClient(daemonClient)
    console.log('[tentacles] Connected to terminal daemon')
  } catch (err) {
    console.warn('[tentacles] Failed to connect to daemon, sessions will not persist:', err)
  }

  // Reconcile daemon sessions with persisted state
  await reconcileSessions()

  // Initialize tRPC IPC handler — must be before createWindow so the handler is ready
  ipcHandler = createIPCHandler({ router: appRouter })

  createWindow()
})

/** Reconcile persisted sessions with daemon state on startup. */
async function reconcileSessions() {
  const activeHookIds = new Set<string>()

  // Get sessions alive in daemon
  let daemonSessions: { id: string; pid: number; cwd: string; createdAt: number }[] = []
  if (daemonClient.isConnected()) {
    try {
      daemonSessions = await daemonClient.list()
    } catch { /* daemon not responding */ }
  }
  const daemonSessionIds = new Set(daemonSessions.map((s) => s.id))

  // Load persisted sessions
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

  // Kill orphaned daemon sessions (in daemon but not in persisted state)
  const persistedIds = new Set(persistedSessions.map((s) => s.id))
  for (const ds of daemonSessions) {
    if (!persistedIds.has(ds.id)) {
      try {
        await daemonClient.kill(ds.id)
        removeScrollback(path.join(getScrollbackDir(), ds.id))
      } catch { /* ignore */ }
    }
  }

  // Cache daemon session IDs for the upcoming loadSessions→reattach calls
  cachedDaemonSessionIds = daemonSessionIds

  // Clean up stale hook files, preserving those for active daemon sessions
  cleanupAllHookFiles(activeHookIds)
}
