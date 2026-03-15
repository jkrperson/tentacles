import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'

const hooksDir = path.join(app.getPath('userData'), 'hooks')

export function getHooksDir(): string {
  return hooksDir
}

export function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
}

/**
 * Manages backup/restore lifecycle for a config file that gets modified
 * while agent sessions are active. Backs up on first session, restores on last.
 */
export class ConfigGuard {
  private activeSessions = 0

  constructor(
    _backupPath: string,
    private readonly backup: () => void,
    private readonly restore: () => void,
  ) {}

  get sessionCount(): number {
    return this.activeSessions
  }

  acquireSession(): void {
    if (this.activeSessions === 0) {
      this.backup()
    }
    this.activeSessions++
  }

  releaseSession(): void {
    this.activeSessions = Math.max(0, this.activeSessions - 1)
    if (this.activeSessions === 0) {
      this.restore()
    }
  }

  forceRestore(): void {
    if (this.activeSessions > 0) {
      this.activeSessions = 0
      this.restore()
    }
  }
}
