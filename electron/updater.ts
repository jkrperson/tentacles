import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { ee } from './trpc/events'

export { autoUpdater }

export function initAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    ee.emit('updater:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    ee.emit('updater:status', {
      status: 'available',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    ee.emit('updater:status', { status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    ee.emit('updater:status', {
      status: 'downloading',
      percent: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    ee.emit('updater:status', { status: 'ready' })
  })

  autoUpdater.on('error', (err) => {
    ee.emit('updater:status', {
      status: 'error',
      message: err.message,
    })
  })

  // Check for updates 5 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}
