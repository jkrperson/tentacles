import * as path from 'node:path'
import * as fs from 'node:fs'
import type { AgentType } from './agents/types'

export interface SessionHookInfo {
  hookId: string
  agentType: AgentType
  hookCleanup?: () => void
}

export class HookManager {
  readonly sessionHookMap = new Map<string, SessionHookInfo>()

  constructor(private readonly hooksDir: string) {}

  register(sessionId: string, info: SessionHookInfo) {
    this.sessionHookMap.set(sessionId, info)
  }

  getInfo(sessionId: string): SessionHookInfo | undefined {
    return this.sessionHookMap.get(sessionId)
  }

  cleanupSession(sessionId: string) {
    const info = this.sessionHookMap.get(sessionId)
    if (!info) return
    info.hookCleanup?.()
    this.cleanupHookFiles(info.hookId)
    this.sessionHookMap.delete(sessionId)
  }

  cleanupHookFiles(hookId: string) {
    try { fs.unlinkSync(path.join(this.hooksDir, `${hookId}.json`)) } catch { /* already deleted */ }
    try { fs.unlinkSync(path.join(this.hooksDir, `${hookId}.out`)) } catch { /* already deleted */ }
    try { fs.unlinkSync(path.join(this.hooksDir, `${hookId}.status`)) } catch { /* already deleted */ }
  }

  cleanupAllHookFiles(preserve = new Set<string>()) {
    try {
      if (!fs.existsSync(this.hooksDir)) return
      for (const file of fs.readdirSync(this.hooksDir)) {
        const hookId = file.replace(/\.(json|out|status)$/, '')
        if (!preserve.has(hookId)) {
          try { fs.unlinkSync(path.join(this.hooksDir, file)) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  clear() {
    this.sessionHookMap.clear()
  }

  getDaemonHookIds(): Set<string> {
    const ids = new Set<string>()
    for (const [, info] of this.sessionHookMap) {
      if (info.hookId) ids.add(info.hookId)
    }
    return ids
  }
}
