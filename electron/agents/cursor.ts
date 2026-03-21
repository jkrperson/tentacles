import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { ensureHooksDir, getHooksDir, ConfigGuard } from './shared'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = getHooksDir()
const cursorHooksPath = path.join(homedir(), '.cursor', 'hooks.json')
const configBackupPath = path.join(hooksDir, 'cursor-original-hooks.bak')

function readCursorHooks(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(cursorHooksPath)) return null
    return JSON.parse(fs.readFileSync(cursorHooksPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeCursorHooks(config: Record<string, unknown>) {
  const dir = path.dirname(cursorHooksPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(cursorHooksPath, JSON.stringify(config, null, 2))
}

const configGuard = new ConfigGuard(
  configBackupPath,
  () => {
    const current = readCursorHooks()
    fs.writeFileSync(configBackupPath, current ? JSON.stringify(current, null, 2) : '')
  },
  () => {
    try {
      if (fs.existsSync(configBackupPath)) {
        const original = fs.readFileSync(configBackupPath, 'utf-8').trim()
        if (original) {
          fs.writeFileSync(cursorHooksPath, original)
        } else {
          try { fs.unlinkSync(cursorHooksPath) } catch { /* ignore */ }
        }
        fs.unlinkSync(configBackupPath)
      }
    } catch { /* ignore */ }
  },
)

/**
 * Write a per-session Cursor hook script.
 *
 * Cursor pipes JSON context to stdin — we MUST drain it to avoid broken-pipe errors.
 * For permission hooks (beforeShellExecution, beforeMCPExecution), we must also
 * write `{"continue":true}` to stdout to auto-approve and unblock the agent.
 */
function writeHookScript(hookId: string, hookServerPort?: number): string {
  const scriptPath = path.join(hooksDir, `cursor-${hookId}.sh`)

  const script = hookServerPort
    ? `#!/bin/sh
# Tentacles Cursor hook — drain stdin, notify hook server.
cat > /dev/null
EVENT_NAME="\${1:-unknown}"

# For permission hooks, output continue response to unblock the agent
case "$EVENT_NAME" in
  beforeShellExecution|beforeMCPExecution)
    printf '{"continue":true}'
    ;;
esac

curl -s --connect-timeout 1 --max-time 2 -X POST \\
  -H "Content-Type: application/json" \\
  -d "{\\"hook_event_name\\":\\"$EVENT_NAME\\"}" \\
  "http://127.0.0.1:${hookServerPort}/hook/${hookId}" >/dev/null 2>&1 &
`
    : `#!/bin/sh
# Tentacles Cursor hook — drain stdin (no hook server available).
cat > /dev/null
EVENT_NAME="\${1:-unknown}"
case "$EVENT_NAME" in
  beforeShellExecution|beforeMCPExecution)
    printf '{"continue":true}'
    ;;
esac
`
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  return scriptPath
}

/** Inject Tentacles hook entries into Cursor hooks.json. */
function injectHooks(hookId: string, hookServerPort?: number) {
  ensureHooksDir()
  const scriptPath = writeHookScript(hookId, hookServerPort)

  configGuard.acquireSession()

  const config = readCursorHooks() ?? {}

  // Cursor hooks.json uses a flat format: { eventName: [{ command: "..." }] }
  const events = ['beforeSubmitPrompt', 'stop', 'beforeShellExecution', 'beforeMCPExecution']
  for (const event of events) {
    const entries = (config[event] ?? []) as Array<{ command?: string }>
    const hasTentacles = entries.some((entry) => entry.command?.includes(scriptPath))
    if (!hasTentacles) {
      entries.push({ command: `"${scriptPath}" ${event}` })
    }
    config[event] = entries
  }

  writeCursorHooks(config)
}

/** Remove a session's hooks from Cursor hooks.json and clean up. */
function removeSessionHooks(hookId: string) {
  const scriptPath = path.join(hooksDir, `cursor-${hookId}.sh`)
  try { fs.unlinkSync(scriptPath) } catch { /* already deleted */ }

  if (configGuard.sessionCount <= 1) {
    configGuard.releaseSession()
  } else {
    configGuard.releaseSession()
    try {
      const config = readCursorHooks()
      if (config) {
        for (const event of ['beforeSubmitPrompt', 'stop', 'beforeShellExecution', 'beforeMCPExecution']) {
          const entries = (config[event] ?? []) as Array<{ command?: string }>
          config[event] = entries.filter((entry) => !entry.command?.includes(scriptPath))
          if ((config[event] as unknown[]).length === 0) delete config[event]
        }
        writeCursorHooks(config)
      }
    } catch { /* config will be restored when last session ends */ }
  }
}

interface CursorHookEvent {
  hook_event_name?: string
}

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',
  name: 'Cursor Agent',
  defaultBinary: 'agent',
  settingsKey: 'cursorCliPath',

  buildSpawnConfig({ binaryPath, cwd, extraArgs = [] }): SpawnConfig {
    return { command: binaryPath, args: [...extraArgs], cwd }
  },

  setupHooks(hookId: string, hookServerPort?: number): HookSetup {
    ensureHooksDir()
    const statusPath = path.join(hooksDir, `${hookId}.status`)

    injectHooks(hookId, hookServerPort)

    return {
      extraArgs: [],
      hookId,
      statusPath,
      cleanup: () => {
        try { fs.unlinkSync(statusPath) } catch { /* already deleted */ }
        removeSessionHooks(hookId)
      },
    }
  },

  parseStatusDetail(event: unknown): string | null {
    const e = event as CursorHookEvent
    const name = e.hook_event_name
    if (name === 'beforeSubmitPrompt') return 'Working...'
    if (name === 'stop') return null
    if (name === 'beforeShellExecution') return 'Needs permission: shell command'
    if (name === 'beforeMCPExecution') return 'Needs permission: MCP tool'
    return null
  },

  parseStatus(event: unknown): 'running' | 'needs_input' | 'idle' | null {
    const e = event as CursorHookEvent
    const name = e.hook_event_name
    if (name === 'beforeSubmitPrompt') return 'running'
    if (name === 'stop') return 'idle'
    if (name === 'beforeShellExecution' || name === 'beforeMCPExecution') return 'needs_input'
    return null
  },
}

export function cleanupCursorConfig() {
  configGuard.forceRestore()
}
