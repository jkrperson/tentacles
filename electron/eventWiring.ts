import { Notification } from 'electron'
import { getAdapter } from './agents/registry'
import { unregisterHookSession } from './hookServer'
import { ee } from './trpc/events'
import type { PtyManager } from './ptyManager'
import type { FileWatcher } from './fileWatcher'
import type { HookManager } from './hookManager'
import type { AgentType } from './agents/types'

interface WiringDeps {
  ptyManager: PtyManager
  fileWatcher: FileWatcher
  hookManager: HookManager
  loadSettings: () => Record<string, unknown>
}

export function wireEvents({ ptyManager, fileWatcher, hookManager, loadSettings }: WiringDeps) {
  const lastTitleStatus = new Map<string, string>()
  const sessionNames = new Map<string, string>()

  // --- PTY events → event emitter ---
  ptyManager.onData((id, data) => {
    ee.emit('session:data', { id, data })
  })

  ptyManager.onTitle((id, title) => {
    ee.emit('session:title', { id, title })

    // Track session name from title (strip spinner/status prefixes)
    const cleanName = title.replace(/^[\u2800-\u28FF\u2733]\s*/, '')
    if (cleanName && cleanName !== 'Claude Code' && cleanName !== 'Codex CLI' && cleanName !== 'opencode') {
      sessionNames.set(id, cleanName)
    }

    const codepoints = [...title].map((c) => 'U+' + (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0'))
    console.log(`[title] id=${id.slice(0, 8)} chars=[${codepoints.join(', ')}] raw="${title}"`)

    const hookInfo = hookManager.getInfo(id)
    const agentType: AgentType = hookInfo?.agentType ?? 'claude'
    const adapter = getAdapter(agentType)

    const parsed = adapter.parseTitle?.(title)
    if (parsed) {
      const prev = lastTitleStatus.get(id)
      lastTitleStatus.set(id, parsed.status)

      if (parsed.status !== prev) {
        ee.emit('session:agentStatus', { id, status: parsed.status })
      }
    }
  })

  ptyManager.onExit((id, exitCode) => {
    lastTitleStatus.delete(id)

    const hookInfo = hookManager.getInfo(id)
    if (hookInfo) {
      unregisterHookSession(hookInfo.hookId)
      hookManager.cleanupSession(id)
    }

    ee.emit('session:statusDetail', { id, detail: null })
    ee.emit('session:exit', { id, exitCode })

    // Desktop notification when agent exits
    if (Notification.isSupported() && loadSettings().desktopNotifications !== false) {
      const name = sessionNames.get(id) ?? 'Agent'
      new Notification({
        title: `${name} exited`,
        body: exitCode === 0 ? `${name} finished successfully` : `${name} exited with code ${exitCode}`,
      }).show()
    }
    sessionNames.delete(id)
  })

  // --- Desktop notifications for agent status changes ---
  // Tracks sessions that have been active, so we don't notify on initial spawn idle
  const hasBeenActive = new Set<string>()
  ee.on('session:agentStatus', ({ id, status }) => {
    if (status === 'running') {
      hasBeenActive.add(id)
      return
    }

    if (!Notification.isSupported() || loadSettings().desktopNotifications === false) return

    const name = sessionNames.get(id) ?? 'Agent'
    if (status === 'needs_input') {
      new Notification({
        title: `${name} needs input`,
        body: `${name} is waiting for permission`,
      }).show()
    } else if (status === 'idle' && hasBeenActive.has(id)) {
      new Notification({
        title: `${name} completed`,
        body: `${name} finished its task`,
      }).show()
    }
  })

  // Clean up tracking on exit
  ee.on('session:exit', ({ id }) => {
    hasBeenActive.delete(id)
  })

  // --- Terminal (shell) events → event emitter ---
  ptyManager.onShellData((id, data) => {
    ee.emit('terminal:data', { id, data })
  })

  ptyManager.onShellExit((id, exitCode) => {
    ee.emit('terminal:exit', { id, exitCode })
  })

  // --- File events → event emitter ---
  fileWatcher.onChanged((eventType, filePath, watchRoot) => {
    ee.emit('file:changed', { eventType: eventType as 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', path: filePath, watchRoot })
  })
}
