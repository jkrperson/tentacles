import * as fs from 'node:fs'
import * as path from 'node:path'

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  '.DS_Store',
  'build',
  'coverage',
])

/** Returns true if any path segment matches an ignored name or starts with '.' */
function isIgnored(relativePath: string): boolean {
  const segments = relativePath.split(path.sep)
  for (const seg of segments) {
    if (IGNORED_SEGMENTS.has(seg)) return true
    // Dotfiles/dotdirs (but not '.' or '..')
    if (seg.startsWith('.') && seg !== '.' && seg !== '..') return true
  }
  return false
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
}

type ChangeCallback = (eventType: string, filePath: string, watchRoot: string) => void

export class FileWatcher {
  private watchers = new Map<string, fs.FSWatcher>()
  private changeCb: ChangeCallback | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  onChanged(cb: ChangeCallback) {
    this.changeCb = cb
  }

  async watch(dirPath: string) {
    // If already watching this path, no-op
    if (this.watchers.has(dirPath)) return

    try {
      // Native recursive watch: uses FSEvents on macOS (1 FD for entire tree),
      // ReadDirectoryChangesW on Windows, inotify on Linux (Node 19.1+).
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        if (isIgnored(filename)) return

        const fullPath = path.join(dirPath, filename)
        this.debouncedNotify(dirPath, fullPath, eventType)
      })

      watcher.on('error', (err: NodeJS.ErrnoException) => {
        // EPERM/EACCES can happen when directories are deleted while being watched
        if (err.code === 'EPERM' || err.code === 'EACCES') return
        console.error(`[FileWatcher] error watching ${dirPath}:`, err.message)
      })

      this.watchers.set(dirPath, watcher)
    } catch (err) {
      console.error(`[FileWatcher] failed to watch ${dirPath}:`, err)
    }
  }

  private debouncedNotify(dirPath: string, fullPath: string, fsEventType: string) {
    const key = `${dirPath}:${fullPath}`
    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key)

      // Determine the actual event type by checking if the path exists
      let eventType: string
      try {
        const stat = fs.statSync(fullPath)
        if (fsEventType === 'rename') {
          // 'rename' + exists = newly created
          eventType = stat.isDirectory() ? 'addDir' : 'add'
        } else {
          // 'change' = content modified
          eventType = 'change'
        }
      } catch {
        // Path doesn't exist = deleted
        eventType = fsEventType === 'rename' ? 'unlink' : 'unlink'
      }

      this.changeCb?.(eventType, fullPath, dirPath)
    }, 300))
  }

  async unwatchDir(dirPath: string) {
    const watcher = this.watchers.get(dirPath)
    if (watcher) {
      watcher.close()
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
      watcher.close()
    }
    this.watchers.clear()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }
}
