import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PtyManager } from './ptyManager'
import { FileWatcher } from './fileWatcher'
import { GitManager } from './gitManager'
import { LspManager } from './lspManager'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const sessionsPath = path.join(app.getPath('userData'), 'sessions.json')

let win: BrowserWindow | null = null
const ptyManager = new PtyManager()
const fileWatcher = new FileWatcher()
const gitManager = new GitManager()
const lspManager = new LspManager()

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

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- PTY IPC ---
ptyManager.onData((id, data) => {
  win?.webContents.send('session:data', { id, data })
})

const lastTitleStatus = new Map<string, string>()

ptyManager.onTitle((id, title) => {
  win?.webContents.send('session:title', { id, title })

  // Debug: log raw title and codepoints to main process console
  const codepoints = [...title].map((c) => 'U+' + (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0'))
  console.log(`[title] id=${id.slice(0, 8)} chars=[${codepoints.join(', ')}] raw="${title}"`)

  // Desktop notification when Claude transitions to idle (waiting for input)
  const firstChar = title.codePointAt(0) ?? 0
  const isIdle = firstChar === 0x2733 // ✳
  const prev = lastTitleStatus.get(id)
  lastTitleStatus.set(id, isIdle ? 'idle' : 'running')

  if (isIdle && prev !== 'idle') {
    const settings = loadSettings()
    if (settings.desktopNotifications !== false && Notification.isSupported()) {
      const name = title.replace(/^\u2733\s*/, '') || 'Agent'
      new Notification({
        title: `${name} is waiting`,
        body: 'Claude is waiting for input',
      }).show()
    }
  }
})

ptyManager.onExit((id, exitCode) => {
  lastTitleStatus.delete(id)

  // Clean up hook resources for this session
  const hookInfo = sessionHookMap.get(id)
  if (hookInfo) {
    clearInterval(hookInfo.pollTimer)
    cleanupHookFiles(hookInfo.hookId)
    sessionHookMap.delete(id)
  }

  // Clear statusDetail before sending exit
  win?.webContents.send('session:statusDetail', { id, detail: null })
  win?.webContents.send('session:exit', { id, exitCode })

  const settings = loadSettings()
  if (settings.desktopNotifications !== false && Notification.isSupported()) {
    new Notification({
      title: 'Session ended',
      body: `Claude session exited with code ${exitCode}`,
    }).show()
  }
})

// --- Hook-based Claude session ID capture ---
const hooksDir = path.join(app.getPath('userData'), 'hooks')

function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
}

function writeHookSettings(hookId: string): { settingsPath: string; outputPath: string; statusPath: string } {
  ensureHooksDir()
  const outputPath = path.join(hooksDir, `${hookId}.out`)
  const statusPath = path.join(hooksDir, `${hookId}.status`)
  const settingsPath = path.join(hooksDir, `${hookId}.json`)

  const statusCmd = `sh -c 'cat > ${JSON.stringify(statusPath)}'`
  const settings = {
    hooks: {
      SessionStart: [
        {
          hooks: [{ type: 'command' as const, command: `sh -c 'cat > ${JSON.stringify(outputPath)}'` }],
        },
      ],
      PreToolUse: [
        { hooks: [{ type: 'command' as const, command: statusCmd }] },
      ],
      PostToolUse: [
        { hooks: [{ type: 'command' as const, command: statusCmd }] },
      ],
      Stop: [
        { hooks: [{ type: 'command' as const, command: statusCmd }] },
      ],
      PermissionRequest: [
        { hooks: [{ type: 'command' as const, command: statusCmd }] },
      ],
    },
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  return { settingsPath, outputPath, statusPath }
}

function waitForSessionId(outputPath: string, timeoutMs = 30000): Promise<string | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const poll = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(null)
        return
      }
      try {
        if (fs.existsSync(outputPath)) {
          const raw = fs.readFileSync(outputPath, 'utf-8').trim()
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.session_id) {
              resolve(parsed.session_id)
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

interface HookEvent {
  hook_event_name?: string
  tool_name?: string
  tool_input?: Record<string, string>
}

function deriveStatusDetail(event: HookEvent): string | null {
  const hookName = event.hook_event_name
  const toolName = event.tool_name
  const toolInput = event.tool_input

  if (hookName === 'Stop') return null

  if (hookName === 'PermissionRequest') {
    return toolName ? `Needs permission: ${toolName}` : 'Needs permission'
  }

  if (hookName === 'PostToolUse') return 'Thinking...'

  if (hookName === 'PreToolUse') {
    if (toolName === 'Bash') {
      return toolInput?.description || 'Running command'
    }
    if (toolName === 'Edit') {
      const file = toolInput?.file_path
      return file ? `Editing ${path.basename(file)}` : 'Editing file'
    }
    if (toolName === 'Write') {
      const file = toolInput?.file_path
      return file ? `Writing ${path.basename(file)}` : 'Writing file'
    }
    if (toolName === 'Read') {
      const file = toolInput?.file_path
      return file ? `Reading ${path.basename(file)}` : 'Reading file'
    }
    if (toolName === 'Grep') return 'Searching code'
    if (toolName === 'Glob') return 'Finding files'
    if (toolName === 'Task') {
      const subagent = toolInput?.subagent_type
      return subagent ? `Running ${subagent}` : 'Running subagent'
    }
    if (toolName === 'WebFetch') return 'Fetching web page'
    if (toolName === 'WebSearch') return 'Searching web'
    if (toolName?.startsWith('mcp__')) {
      const segments = toolName.split('__')
      const toolSegment = segments[segments.length - 1] || toolName
      return `Using ${toolSegment}`
    }
    return toolName ? `Using ${toolName}` : 'Working...'
  }

  return null
}

// Track hook resources per PTY session for cleanup
// Uses polling instead of fs.watch to avoid holding a file descriptor per session
const sessionHookMap = new Map<string, { hookId: string; pollTimer: ReturnType<typeof setInterval> }>()

function pollStatusFile(statusPath: string, ptyId: string): ReturnType<typeof setInterval> {
  // Create the file so the poll has something to read
  if (!fs.existsSync(statusPath)) {
    fs.writeFileSync(statusPath, '')
  }
  let lastContent = ''
  return setInterval(() => {
    try {
      const raw = fs.readFileSync(statusPath, 'utf-8').trim()
      if (!raw || raw === lastContent) return
      lastContent = raw
      const event = JSON.parse(raw)
      const detail = deriveStatusDetail(event)
      win?.webContents.send('session:statusDetail', { id: ptyId, detail })
    } catch {
      // file not ready or malformed JSON
    }
  }, 200)
}

/** Remove all files in the hooks directory (best-effort). */
function cleanupAllHookFiles() {
  try {
    if (fs.existsSync(hooksDir)) {
      for (const file of fs.readdirSync(hooksDir)) {
        try { fs.unlinkSync(path.join(hooksDir, file)) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function spawnWithHook(name: string, cwd: string, extraArgs: string[] = []): { id: string; pid: number } {
  const settings = loadSettings()
  const claudeCliPath = settings.claudeCliPath || 'claude'
  const hookId = randomUUID()
  const { settingsPath, outputPath, statusPath } = writeHookSettings(hookId)

  const args = [...extraArgs, '--settings', settingsPath]
  const result = ptyManager.create(name, cwd, claudeCliPath, args)

  // Poll the status file for hook events (polling avoids holding an FD open)
  const pollTimer = pollStatusFile(statusPath, result.id)
  sessionHookMap.set(result.id, { hookId, pollTimer })

  // Async: wait for session ID, send to renderer, cleanup .out only
  waitForSessionId(outputPath).then((claudeSessionId) => {
    if (claudeSessionId) {
      win?.webContents.send('session:claudeSessionId', { id: result.id, claudeSessionId })
    }
    // Only clean up the .out file — .json and .status are needed for the session lifetime
    try { fs.unlinkSync(outputPath) } catch { /* already deleted */ }
  })

  return result
}

ipcMain.handle('session:create', (_e, name: string, cwd: string) => {
  return spawnWithHook(name, cwd)
})

ipcMain.handle('session:resume', (_e, claudeSessionId: string, name: string, cwd: string) => {
  return spawnWithHook(name, cwd, ['--resume', claudeSessionId])
})

ipcMain.handle('session:write', (_e, id: string, data: string) => {
  ptyManager.write(id, data)
})

ipcMain.handle('session:resize', (_e, id: string, cols: number, rows: number) => {
  ptyManager.resize(id, cols, rows)
})

ipcMain.handle('session:kill', (_e, id: string) => {
  ptyManager.kill(id)
})

ipcMain.handle('session:list', () => {
  return ptyManager.list()
})

// --- Terminal (shell) IPC ---
ptyManager.onShellData((id, data) => {
  win?.webContents.send('terminal:data', { id, data })
})

ptyManager.onShellExit((id, exitCode) => {
  win?.webContents.send('terminal:exit', { id, exitCode })
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
  win?.webContents.send('file:changed', { eventType, path: filePath, watchRoot })
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
  ptyManager.killAll()
  lspManager.stopAll()
  await fileWatcher.unwatch()

  // Stop all status file polling timers
  for (const [, { pollTimer }] of sessionHookMap) {
    clearInterval(pollTimer)
  }
  sessionHookMap.clear()

  // Clean up leftover hook files
  cleanupAllHookFiles()
})

app.whenReady().then(() => {
  // Clean up stale hook files from previous sessions/crashes
  cleanupAllHookFiles()
  createWindow()
})
