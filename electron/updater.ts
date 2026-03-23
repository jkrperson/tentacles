import { net } from 'electron'
import { ee } from './trpc/events'

const GITHUB_OWNER = 'jkrperson'
const GITHUB_REPO = 'tentacles'
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: Array<{ name: string; browser_download_url: string }>
}

let currentVersion = '0.0.0'

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function checkForUpdates(): Promise<void> {
  ee.emit('updater:status', { status: 'checking' })
  try {
    const data = await fetchLatestRelease()
    if (!data || !data.tag_name) {
      ee.emit('updater:status', { status: 'up-to-date' })
      return
    }
    const latestVersion = data.tag_name.replace(/^v/, '')
    if (compareVersions(latestVersion, currentVersion) > 0) {
      // Find the right dmg asset for this platform + arch
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
      const dmgAsset = data.assets?.find(
        (a) => a.name.endsWith('.dmg') && a.name.includes(arch)
      )
      ee.emit('updater:status', {
        status: 'available',
        version: latestVersion,
        downloadUrl: dmgAsset?.browser_download_url,
        releaseUrl: data.html_url,
      })
    } else {
      ee.emit('updater:status', { status: 'up-to-date' })
    }
  } catch (err) {
    ee.emit('updater:status', {
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed to check for updates',
    })
  }
}

function fetchLatestRelease(): Promise<GitHubRelease | null> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    })
    request.setHeader('Accept', 'application/vnd.github.v3+json')
    request.setHeader('User-Agent', 'Tentacles-Updater')

    let body = ''
    request.on('response', (response) => {
      if (response.statusCode === 404) {
        resolve(null)
        return
      }
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('Invalid JSON from GitHub'))
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

export function initUpdater(appVersion: string) {
  currentVersion = appVersion

  // Check 5 seconds after launch
  setTimeout(() => {
    checkForUpdates().catch(() => {})
  }, 5000)

  // Then periodically
  setInterval(() => {
    checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}
