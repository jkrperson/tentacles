import * as fs from 'node:fs'
import * as path from 'node:path'

const IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/dist-electron/**',
  '**/.DS_Store',
  '**/.*',
  '**/build/**',
  '**/coverage/**',
]

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
}

type ChangeCallback = (eventType: string, filePath: string, watchRoot: string) => void

export class FileWatcher {
  private watchers = new Map<string, any>()
  private changeCb: ChangeCallback | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  onChanged(cb: ChangeCallback) {
    this.changeCb = cb
  }

  async watch(dirPath: string) {
    // If already watching this path, no-op
    if (this.watchers.has(dirPath)) return

    const chokidar = await import('chokidar')
    const watcher = chokidar.watch(dirPath, {
      ignored: IGNORED,
      ignoreInitial: true,
      depth: 3,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    })

    const notify = (eventType: string, filePath: string) => {
      const key = `${dirPath}:${filePath}`
      const existing = this.debounceTimers.get(key)
      if (existing) clearTimeout(existing)
      this.debounceTimers.set(key, setTimeout(() => {
        this.debounceTimers.delete(key)
        this.changeCb?.(eventType, filePath, dirPath)
      }, 300))
    }

    watcher
      .on('add', (p: string) => notify('add', p))
      .on('change', (p: string) => notify('change', p))
      .on('unlink', (p: string) => notify('unlink', p))
      .on('addDir', (p: string) => notify('addDir', p))
      .on('unlinkDir', (p: string) => notify('unlinkDir', p))

    this.watchers.set(dirPath, watcher)
  }

  async unwatchDir(dirPath: string) {
    const watcher = this.watchers.get(dirPath)
    if (watcher) {
      await watcher.close()
      this.watchers.delete(dirPath)
    }
    // Clean up debounce timers for this dir
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${dirPath}:`)) {
        clearTimeout(timer)
        this.debounceTimers.delete(key)
      }
    }
  }

  readDir(dirPath: string): FileNode[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const nodes: FileNode[] = []

      for (const entry of entries) {
        if (entry.name === '.git') continue
        if (entry.name === 'node_modules') continue
        if (entry.name === 'dist' || entry.name === 'dist-electron') continue
        if (entry.name === 'build' || entry.name === 'coverage') continue

        nodes.push({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: entry.isDirectory() ? 'directory' : 'file',
        })
      }

      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return nodes
    } catch {
      return []
    }
  }

  async unwatch() {
    for (const watcher of this.watchers.values()) {
      await watcher.close()
    }
    this.watchers.clear()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }
}
