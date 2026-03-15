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
}

export function wireEvents({ ptyManager, fileWatcher, hookManager }: WiringDeps) {
  const lastTitleStatus = new Map<string, string>()

  // --- PTY events → event emitter ---
  ptyManager.onData((id, data) => {
    ee.emit('session:data', { id, data })
  })

  ptyManager.onTitle((id, title) => {
    ee.emit('session:title', { id, title })

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

      // Desktop notification when agent needs input
      if (parsed.status === 'needs_input' && prev !== 'needs_input' && Notification.isSupported()) {
        const displayName = parsed.name || 'Agent'
        new Notification({
          title: `${displayName} needs input`,
          body: `${adapter.name} is waiting for permission`,
        }).show()
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

    // Desktop notification when agent completes
    if (Notification.isSupported()) {
      new Notification({
        title: 'Agent completed',
        body: exitCode === 0 ? 'Agent finished successfully' : `Agent exited with code ${exitCode}`,
      }).show()
    }
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
