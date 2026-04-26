import { app, powerMonitor, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { ee } from './trpc/events'

const { autoUpdater } = pkg

const GITHUB_OWNER = 'jkrperson'
const GITHUB_REPO = 'tentacles'
const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const MIN_CHECK_GAP_MS = 5 * 60 * 1000 // throttle focus/resume re-checks

let initialized = false
let lastCheckAt = 0
let pendingVersion: string | undefined

function releaseUrlFor(version?: string): string | undefined {
  if (!version) return undefined
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version.replace(/^v/, '')}`
}

export async function checkForUpdates(): Promise<void> {
  if (!initialized) {
    ee.emit('updater:status', { status: 'up-to-date' })
    return
  }
  try {
    lastCheckAt = Date.now()
    await autoUpdater.checkForUpdates()
  } catch (err) {
    ee.emit('updater:status', {
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed to check for updates',
    })
  }
}

function maybeCheckForUpdates(): void {
  if (!initialized) return
  if (Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return
  void checkForUpdates()
}

export function restartAndInstall(): void {
  if (!initialized) return
  autoUpdater.quitAndInstall()
}

export function initUpdater() {
  if (initialized) return
  if (!app.isPackaged) return // electron-updater is a no-op in dev
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false // require explicit user confirmation

  autoUpdater.on('checking-for-update', () => {
    ee.emit('updater:status', { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version
    ee.emit('updater:status', {
      status: 'available',
      version: info.version,
      releaseUrl: releaseUrlFor(info.version),
    })
  })
  autoUpdater.on('update-not-available', () => {
    ee.emit('updater:status', { status: 'up-to-date' })
  })
  autoUpdater.on('download-progress', (p) => {
    ee.emit('updater:status', {
      status: 'downloading',
      progress: Math.round(p.percent),
      version: pendingVersion,
      releaseUrl: releaseUrlFor(pendingVersion),
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    ee.emit('updater:status', {
      status: 'downloaded',
      version: info.version,
      releaseUrl: releaseUrlFor(info.version),
    })
  })
  autoUpdater.on('error', (err) => {
    ee.emit('updater:status', {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  })

  setTimeout(() => { void checkForUpdates() }, 5000)
  setInterval(() => { void checkForUpdates() }, CHECK_INTERVAL_MS)

  powerMonitor.on('resume', () => { maybeCheckForUpdates() })

  app.on('browser-window-focus', () => { maybeCheckForUpdates() })

  for (const win of BrowserWindow.getAllWindows()) {
    win.on('focus', () => { maybeCheckForUpdates() })
  }
}
