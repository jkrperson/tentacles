import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { PtyManager } from './ptyManager'
import { FileWatcher } from './fileWatcher'

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

let win: BrowserWindow | null = null
const ptyManager = new PtyManager()
const fileWatcher = new FileWatcher()

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveSettings(settings: any) {
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
  win?.webContents.send('session:exit', { id, exitCode })

  const settings = loadSettings()
  if (settings.desktopNotifications !== false && Notification.isSupported()) {
    new Notification({
      title: 'Session ended',
      body: `Claude session exited with code ${exitCode}`,
    }).show()
  }
})

ipcMain.handle('session:create', (_e, name: string, cwd: string) => {
  const settings = loadSettings()
  return ptyManager.create(name, cwd, settings.claudeCliPath || 'claude')
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

// --- App IPC ---
ipcMain.handle('app:getSettings', () => {
  return loadSettings()
})

ipcMain.handle('app:saveSettings', (_e, settings: any) => {
  saveSettings(settings)
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
  await fileWatcher.unwatch()
})

app.whenReady().then(createWindow)
