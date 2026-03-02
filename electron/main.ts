import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as http from 'node:http'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PtyManager } from './ptyManager'
import { FileWatcher } from './fileWatcher'
import { GitManager } from './gitManager'
import { LspManager } from './lspManager'
import { initAutoUpdater } from './updater'
import { getAdapter } from './agents/registry'
import { cleanupCodexConfig } from './agents/codex'
import type { AgentType } from './agents/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Raise macOS file descriptor limit — GUI apps launched from Finder default to 256,
// which is easily exhausted by PTYs + file watchers + child processes.
if (process.platform === 'darwin' || process.platform === 'linux') {
  try {
    const raw = execSync('ulimit -n', { encoding: 'utf-8', timeout: 2000 }).trim()
    const current = parseInt(raw, 10)
    if (current < 4096) {
      // Try to raise the soft limit via a login shell (inherits the new limit back to us
      // only if we re-exec, so we just log a warning for now and rely on reduced FD usage).
      console.warn(`[tentacles] Low file descriptor limit: ${current}. Recommend running 'ulimit -n 10240' before launching.`)
    }
  } catch { /* ignore */ }
}

// Fix PATH when launched from Finder/desktop launcher
// macOS .app bundles and Linux AppImages get a minimal system PATH,
// missing user shell paths where tools like `claude` are installed.
// Windows inherits the full user+system PATH from the registry, so no fix needed.
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

      // Serve static assets if the file exists and has an extension;
      // otherwise fall back to index.html for SPA client-side routing.
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

let win: BrowserWindow | null = null
const ptyManager = new PtyManager()
const fileWatcher = new FileWatcher()
const gitManager = new GitManager()
const lspManager = new LspManager()

/** Safely send an IPC message to the renderer — no-op if the window is destroyed. */
function sendToRenderer(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveSettings(settings: Record<string, unknown>) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

const themeBgMap: Record<string, string> = {
  obsidian: '#0e0e10',
  midnight: '#0b0d14',
  ember: '#110e0c',
  dawn: '#faf8f5',
}

function createWindow() {
  const settings = loadSettings()
  const bgColor = themeBgMap[settings.theme] ?? '#0e0e10'

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

  // Prevent iframes (e.g. YouTube/Twitch embeds) from navigating the top-level window
  win.webContents.on('will-navigate', (event, url) => {
    const baseURL = VITE_DEV_SERVER_URL ?? rendererURL ?? 'file://'
    if (!url.startsWith(baseURL)) event.preventDefault()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadURL(rendererURL!)
    initAutoUpdater(win)
  }
}

// --- PTY IPC ---
ptyManager.onData((id, data) => {
  sendToRenderer('session:data', { id, data })
})

const lastTitleStatus = new Map<string, string>()

ptyManager.onTitle((id, title) => {
  sendToRenderer('session:title', { id, title })

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
    hookInfo.abortCtrl?.abort() // Cancel waitForSessionId polling
    // Preserve hook files if the tmux session is still alive (app quit — will reattach on restart)
    const tmuxAlive = hookInfo.tmuxSessionName && ptyManager.hasTmuxSession(hookInfo.tmuxSessionName)
    if (!tmuxAlive) {
      hookInfo.hookCleanup?.()
      cleanupHookFiles(hookInfo.hookId)
    }
    sessionHookMap.delete(id)
    // Shared poll timer stops itself when the map is empty
  }

  // Clear statusDetail before sending exit
  sendToRenderer('session:statusDetail', { id, detail: null })
  sendToRenderer('session:exit', { id, exitCode })

  const settings = loadSettings()
  if (settings.desktopNotifications !== false && Notification.isSupported()) {
    new Notification({
      title: 'Session ended',
      body: `Agent session exited with code ${exitCode}`,
    }).show()
  }
})

// --- Hook-based session ID capture ---
const hooksDir = path.join(app.getPath('userData'), 'hooks')

function waitForSessionId(outputPath: string, adapter: ReturnType<typeof getAdapter>, signal?: AbortSignal, timeoutMs = 30000): Promise<string | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const poll = () => {
      if (signal?.aborted || Date.now() - start > timeoutMs) {
        resolve(null)
        return
      }
      try {
        if (fs.existsSync(outputPath)) {
          const raw = fs.readFileSync(outputPath, 'utf-8').trim()
          if (raw) {
            const parsed = JSON.parse(raw)
            const sessionId = adapter.parseSessionId?.(parsed)
            if (sessionId) {
              resolve(sessionId)
              return
            }
          }
        }
      } catch {
        // file not ready yet or malformed
      }
      setTimeout(poll, 200)
    }
    poll()
  })
}

function cleanupHookFiles(hookId: string) {
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.json`)) } catch { /* already deleted */ }
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.out`)) } catch { /* already deleted */ }
  try { fs.unlinkSync(path.join(hooksDir, `${hookId}.status`)) } catch { /* already deleted */ }
}

// Track hook resources per PTY session for cleanup.
// A single shared interval polls all status files to avoid FD exhaustion (EMFILE).
const sessionHookMap = new Map<string, { hookId: string; statusPath: string; lastContent: string; abortCtrl?: AbortController; tmuxSessionName?: string; agentType: AgentType; hookCleanup?: () => void }>()
let sharedPollTimer: ReturnType<typeof setInterval> | null = null

function startSharedPoll() {
  if (sharedPollTimer) return
  sharedPollTimer = setInterval(() => {
    for (const [ptyId, info] of sessionHookMap) {
      try {
        const raw = fs.readFileSync(info.statusPath, 'utf-8').trim()
        if (!raw || raw === info.lastContent) continue
        info.lastContent = raw
        const event = JSON.parse(raw)
        const adapter = getAdapter(info.agentType)
        const detail = adapter.parseStatusDetail?.(event) ?? null
        sendToRenderer('session:statusDetail', { id: ptyId, detail })

        // Emit agent status changes (e.g. Codex idle on agent-turn-complete)
        const status = adapter.parseStatus?.(event) ?? null
        if (status) {
          sendToRenderer('session:agentStatus', { id: ptyId, status })
        }
      } catch {
        // file not ready or malformed JSON
      }
    }
    // Stop polling when no sessions remain
    if (sessionHookMap.size === 0) {
      clearInterval(sharedPollTimer!)
      sharedPollTimer = null
    }
  }, 500)
}

function registerStatusPoll(statusPath: string, ptyId: string, agentType: AgentType, tmuxSessionName?: string) {
  if (!fs.existsSync(statusPath)) {
    fs.writeFileSync(statusPath, '')
  }
  sessionHookMap.set(ptyId, { hookId: '', statusPath, lastContent: '', tmuxSessionName, agentType })
  startSharedPoll()
}

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

function spawnAgent(name: string, cwd: string, agentType: AgentType, resumeId?: string): { id: string; pid: number; tmuxSessionName?: string; hookId: string } {
  const settings = loadSettings()
  const adapter = getAdapter(agentType)
  const binaryPath = (settings[adapter.settingsKey] as string) || adapter.defaultBinary
  const hookId = randomUUID()

  // Set up hooks if the adapter supports them
  const hookSetup = adapter.setupHooks?.(hookId) ?? null
  const extraArgs = hookSetup?.extraArgs ?? []

  // Build spawn config via adapter
  const spawnConfig = adapter.buildSpawnConfig({
    binaryPath,
    cwd,
    resumeId,
    extraArgs,
  })

  // Merge hook env (e.g. TENTACLES_HOOK_ID for Codex) into spawn config env
  const mergedEnv = { ...spawnConfig.env, ...hookSetup?.env }
  const hasEnv = Object.keys(mergedEnv).length > 0

  const result = ptyManager.create(name, spawnConfig.cwd, spawnConfig.command, spawnConfig.args, hasEnv ? mergedEnv : undefined)

  // Register hook-based polling only if the adapter set up hooks
  if (hookSetup) {
    registerStatusPoll(hookSetup.statusPath, result.id, agentType, result.tmuxSessionName)
    const abortCtrl = new AbortController()
    const entry = sessionHookMap.get(result.id)!
    entry.hookId = hookId
    entry.abortCtrl = abortCtrl
    entry.hookCleanup = hookSetup.cleanup

    // Async: wait for session ID, send to renderer, cleanup .out only
    if (hookSetup.outputPath) {
      const outputPath = hookSetup.outputPath
      waitForSessionId(outputPath, adapter, abortCtrl.signal).then((claudeSessionId) => {
        if (claudeSessionId) {
          sendToRenderer('session:claudeSessionId', { id: result.id, claudeSessionId })
        }
        try { fs.unlinkSync(outputPath) } catch { /* already deleted */ }
      })
    }
  }

  return { id: result.id, pid: result.pid, tmuxSessionName: result.tmuxSessionName, hookId }
}

ipcMain.handle('session:create', (_e, name: string, cwd: string, agentType?: AgentType) => {
  return spawnAgent(name, cwd, agentType ?? 'claude')
})

ipcMain.handle('session:resume', (_e, resumeId: string, name: string, cwd: string, agentType?: AgentType) => {
  return spawnAgent(name, cwd, agentType ?? 'claude', resumeId)
})

ipcMain.handle('session:write', (_e, id: string, data: string) => {
  ptyManager.write(id, data)
})

ipcMain.handle('session:resize', (_e, id: string, cols: number, rows: number) => {
  ptyManager.resize(id, cols, rows)
})

ipcMain.handle('session:kill', (_e, id: string) => {
  ptyManager.killWithTmux(id)
})

ipcMain.handle('session:reattach', (_e, tmuxSessionName: string, hookId: string, name: string, cwd: string, agentType?: AgentType) => {
  const result = ptyManager.reattachAgent(name, cwd, tmuxSessionName)
  if (!result) return null

  const resolvedAgentType: AgentType = agentType ?? 'claude'
  const adapter = getAdapter(resolvedAgentType)

  // Re-register status polling for this session
  if (hookId) {
    const statusPath = path.join(hooksDir, `${hookId}.status`)
    registerStatusPoll(statusPath, result.id, resolvedAgentType, tmuxSessionName)
    const entry = sessionHookMap.get(result.id)!
    entry.hookId = hookId
  }

  // Immediately read .status file so the renderer shows status without waiting for the poll interval
  let initialStatusDetail: string | null = null
  if (hookId && adapter.parseStatusDetail) {
    try {
      const statusPath = path.join(hooksDir, `${hookId}.status`)
      const raw = fs.readFileSync(statusPath, 'utf-8').trim()
      if (raw) {
        const event = JSON.parse(raw)
        initialStatusDetail = adapter.parseStatusDetail(event)
      }
    } catch { /* file missing or malformed */ }
  }

  // Query pane title to seed lastTitleStatus for desktop notification dedup
  const paneTitle = ptyManager.getTmuxPaneTitle(tmuxSessionName) ?? undefined
  if (paneTitle && adapter.parseTitle) {
    const parsed = adapter.parseTitle(paneTitle)
    if (parsed) {
      lastTitleStatus.set(result.id, parsed.status)
    }
  }

  // Try recovering claudeSessionId from .out file (crash before capture edge case)
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

  return { ...result, paneTitle, initialStatusDetail, recoveredClaudeSessionId }
})

ipcMain.handle('session:list', () => {
  return ptyManager.list()
})

// --- Terminal (shell) IPC ---
ptyManager.onShellData((id, data) => {
  sendToRenderer('terminal:data', { id, data })
})

ptyManager.onShellExit((id, exitCode) => {
  sendToRenderer('terminal:exit', { id, exitCode })
})

ipcMain.handle('terminal:create', (_e, name: string, cwd: string) => {
  return ptyManager.createShell(name, cwd)
})

ipcMain.handle('terminal:write', (_e, id: string, data: string) => {
  ptyManager.write(id, data)
})

ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => {
  ptyManager.resize(id, cols, rows)
})

ipcMain.handle('terminal:kill', (_e, id: string) => {
  ptyManager.kill(id)
})

// --- File IPC ---
fileWatcher.onChanged((eventType, filePath, watchRoot) => {
  sendToRenderer('file:changed', { eventType, path: filePath, watchRoot })
})

ipcMain.handle('file:readDir', (_e, dirPath: string) => {
  return fileWatcher.readDir(dirPath)
})

ipcMain.handle('file:readFile', async (_e, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('file:writeFile', async (_e, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
})

ipcMain.handle('file:watch', async (_e, dirPath: string) => {
  await fileWatcher.watch(dirPath)
})

ipcMain.handle('file:unwatchDir', async (_e, dirPath: string) => {
  await fileWatcher.unwatchDir(dirPath)
})

ipcMain.handle('file:unwatch', async () => {
  await fileWatcher.unwatch()
})

// --- Dialog IPC ---
ipcMain.handle('dialog:selectDirectory', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// --- Git IPC ---
ipcMain.handle('git:isRepo', (_e, dirPath: string) => {
  return gitManager.isRepo(dirPath)
})

ipcMain.handle('git:status', (_e, dirPath: string) => {
  return gitManager.status(dirPath)
})

ipcMain.handle('git:worktree:create', (_e, repoPath: string, name?: string) => {
  return gitManager.createWorktree(repoPath, name)
})

ipcMain.handle('git:worktree:remove', (_e, repoPath: string, worktreePath: string) => {
  return gitManager.removeWorktree(repoPath, worktreePath)
})

ipcMain.handle('git:worktree:list', (_e, repoPath: string) => {
  return gitManager.listWorktrees(repoPath)
})

ipcMain.handle('git:stage', (_e, repoPath: string, paths: string[]) => {
  return gitManager.stage(repoPath, paths)
})

ipcMain.handle('git:unstage', (_e, repoPath: string, paths: string[]) => {
  return gitManager.unstage(repoPath, paths)
})

ipcMain.handle('git:commit', (_e, repoPath: string, message: string) => {
  return gitManager.commit(repoPath, message)
})

ipcMain.handle('git:push', (_e, repoPath: string) => {
  return gitManager.push(repoPath)
})

ipcMain.handle('git:pull', (_e, repoPath: string) => {
  return gitManager.pull(repoPath)
})

ipcMain.handle('git:branches', (_e, repoPath: string) => {
  return gitManager.listBranches(repoPath)
})

ipcMain.handle('git:switchBranch', (_e, repoPath: string, branch: string) => {
  return gitManager.switchBranch(repoPath, branch)
})

ipcMain.handle('git:createBranch', (_e, repoPath: string, name: string, checkout?: boolean) => {
  return gitManager.createBranch(repoPath, name, checkout)
})

ipcMain.handle('git:stash', (_e, repoPath: string, message?: string) => {
  return gitManager.stash(repoPath, message)
})

ipcMain.handle('git:stashPop', (_e, repoPath: string) => {
  return gitManager.stashPop(repoPath)
})

ipcMain.handle('git:showFile', (_e, repoPath: string, ref: string, filePath: string) => {
  return gitManager.showFile(repoPath, ref, filePath)
})

// --- LSP IPC ---
ipcMain.handle('lsp:start', async (_e, languageId: string, projectRoot: string) => {
  return lspManager.start(languageId, projectRoot)
})

ipcMain.handle('lsp:stop', (_e, languageId: string, projectRoot: string) => {
  lspManager.stop(languageId, projectRoot)
})

ipcMain.handle('lsp:status', (_e, languageId: string, projectRoot: string) => {
  return lspManager.status(languageId, projectRoot)
})

ipcMain.handle('lsp:listAvailable', () => {
  return lspManager.listAvailable()
})

// --- App IPC ---
ipcMain.handle('app:getSettings', () => {
  return loadSettings()
})

ipcMain.handle('app:saveSettings', (_e, settings: Record<string, unknown>) => {
  saveSettings(settings)
})

ipcMain.handle('app:loadSessions', () => {
  try {
    return JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
  } catch {
    return { sessions: [], archived: [], activeSessionId: null }
  }
})

ipcMain.handle('app:saveSessions', (_e, data: Record<string, unknown>) => {
  fs.writeFileSync(sessionsPath, JSON.stringify(data, null, 2))
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPlatform', () => {
  return process.platform
})

ipcMain.handle('app:getHomePath', () => {
  return app.getPath('home')
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
  // Collect hookIds for tmux-backed sessions BEFORE killing
  const tmuxHookIds = new Set<string>()
  for (const [, info] of sessionHookMap) {
    if (info.tmuxSessionName && info.hookId) {
      tmuxHookIds.add(info.hookId)
    }
  }

  ptyManager.killAll()
  lspManager.stopAll()
  await fileWatcher.unwatch()

  // Restore Codex config.toml notify setting
  cleanupCodexConfig()

  // Stop the shared status file polling timer
  if (sharedPollTimer) {
    clearInterval(sharedPollTimer)
    sharedPollTimer = null
  }
  sessionHookMap.clear()

  // Clean up hook files, preserving those for tmux-backed sessions
  cleanupAllHookFiles(tmuxHookIds)
})

app.whenReady().then(async () => {
  // Start local HTTP server for production so embeds see a real http:// origin
  if (!VITE_DEV_SERVER_URL) {
    rendererURL = await startRendererServer(RENDERER_DIST)
  }

  // Collect active tmux names and hookIds from persisted state
  const activeTmuxNames = new Set<string>()
  const activeHookIds = new Set<string>()

  try {
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    for (const s of sessions.sessions || []) {
      if (s.tmuxSessionName) activeTmuxNames.add(s.tmuxSessionName)
      if (s.tmuxSessionName && s.hookId) activeHookIds.add(s.hookId)
    }
  } catch { /* ignore */ }

  // Clean up stale hook files, preserving those for active tmux sessions
  cleanupAllHookFiles(activeHookIds)

  // Clean up orphaned tmux sessions from previous runs/crashes
  ptyManager.cleanupOrphanedSessions(activeTmuxNames)

  createWindow()
})
