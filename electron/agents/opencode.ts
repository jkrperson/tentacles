import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { ensureHooksDir, getHooksDir, ConfigGuard } from './shared'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = getHooksDir()
const opencodeConfigDir = path.join(homedir(), '.config', 'opencode')
const opencodeConfigPath = path.join(opencodeConfigDir, 'config.json')
const configBackupPath = path.join(hooksDir, 'opencode-original-config.bak')

/** Read the current opencode config. Returns parsed JSON or null. */
function readOpencodeConfig(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(opencodeConfigPath)) return null
    const content = fs.readFileSync(opencodeConfigPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/** Write the opencode config. Creates the directory if needed. */
function writeOpencodeConfig(config: Record<string, unknown>) {
  if (!fs.existsSync(opencodeConfigDir)) {
    fs.mkdirSync(opencodeConfigDir, { recursive: true })
  }
  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2))
}

const configGuard = new ConfigGuard(
  configBackupPath,
  () => {
    // Backup current config
    const currentConfig = readOpencodeConfig()
    fs.writeFileSync(configBackupPath, currentConfig ? JSON.stringify(currentConfig, null, 2) : '')
  },
  () => {
    // Restore original config
    try {
      if (fs.existsSync(configBackupPath)) {
        const original = fs.readFileSync(configBackupPath, 'utf-8').trim()
        if (original) {
          fs.writeFileSync(opencodeConfigPath, original)
        } else {
          try { fs.unlinkSync(opencodeConfigPath) } catch { /* ignore */ }
        }
        fs.unlinkSync(configBackupPath)
      }
    } catch { /* ignore */ }
  },
)

interface OpencodeHookEvent {
  event?: string
}

/** Write (or rewrite) the per-session notify script with the given hook server port. */
function writeSessionScript(hookId: string, hookServerPort?: number) {
  const sessionScriptPath = path.join(hooksDir, `opencode-${hookId}.sh`)
  const script = hookServerPort
    ? `#!/bin/sh
curl -s --connect-timeout 1 --max-time 2 -X POST -H "Content-Type: application/json" -d "{\\"event\\":\\"$TENTACLES_EVENT_TYPE\\"}" http://127.0.0.1:${hookServerPort}/hook/${hookId}
`
    : `#!/bin/sh
printf '{"event":"%s"}' "$TENTACLES_EVENT_TYPE" > ${JSON.stringify(path.join(hooksDir, `${hookId}.status`))}
`
  fs.writeFileSync(sessionScriptPath, script, { mode: 0o755 })
  return sessionScriptPath
}

function injectHooks(hookId: string, hookServerPort?: number) {
  ensureHooksDir()

  const sessionScriptPath = writeSessionScript(hookId, hookServerPort)

  configGuard.acquireSession()

  // Read or create config, inject hooks
  const config = readOpencodeConfig() ?? {}
  const experimental = (config.experimental ?? {}) as Record<string, unknown>
  const hook = (experimental.hook ?? {}) as Record<string, unknown[]>

  // Add session_completed hook
  const sessionCompletedHooks = (hook.session_completed ?? []) as Array<{ command: string[]; environment?: Record<string, string> }>
  const hasTentaclesHook = sessionCompletedHooks.some(h => h.command?.[0] === sessionScriptPath)
  if (!hasTentaclesHook) {
    sessionCompletedHooks.push({
      command: [sessionScriptPath],
      environment: { TENTACLES_EVENT_TYPE: 'session_completed' },
    })
  }
  hook.session_completed = sessionCompletedHooks

  // Add permission_requested hook if supported
  const permissionHooks = (hook.permission_requested ?? []) as Array<{ command: string[]; environment?: Record<string, string> }>
  const hasTentaclesPermHook = permissionHooks.some(h => h.command?.[0] === sessionScriptPath)
  if (!hasTentaclesPermHook) {
    permissionHooks.push({
      command: [sessionScriptPath],
      environment: { TENTACLES_EVENT_TYPE: 'permission_requested' },
    })
  }
  hook.permission_requested = permissionHooks

  experimental.hook = hook
  config.experimental = experimental
  writeOpencodeConfig(config)
}

/** Remove a session's hooks from the config and clean up. */
function removeSessionHooks(hookId: string) {
  const sessionScriptPath = path.join(hooksDir, `opencode-${hookId}.sh`)

  // Remove per-session script
  try { fs.unlinkSync(sessionScriptPath) } catch { /* already deleted */ }

  if (configGuard.sessionCount <= 1) {
    configGuard.releaseSession()
  } else {
    configGuard.releaseSession()
    // Remove this session's hooks from the shared config (still active sessions)
    try {
      const config = readOpencodeConfig()
      if (config) {
        const experimental = (config.experimental ?? {}) as Record<string, unknown>
        const hook = (experimental.hook ?? {}) as Record<string, unknown[]>

        for (const eventType of ['session_completed', 'permission_requested']) {
          const hooks = (hook[eventType] ?? []) as Array<{ command: string[] }>
          hook[eventType] = hooks.filter(h => h.command?.[0] !== sessionScriptPath)
          if ((hook[eventType] as unknown[]).length === 0) delete hook[eventType]
        }

        experimental.hook = hook
        config.experimental = experimental
        writeOpencodeConfig(config)
      }
    } catch { /* ignore — config will be restored when last session ends */ }
  }
}

export const opencodeAdapter: AgentAdapter = {
  id: 'opencode',
  name: 'opencode',
  defaultBinary: 'opencode',
  settingsKey: 'opencodeCliPath',

  buildSpawnConfig({ binaryPath, cwd, resumeId, extraArgs = [] }): SpawnConfig {
    const args = resumeId
      ? ['--session', resumeId, ...extraArgs]
      : [...extraArgs, cwd]
    return { command: binaryPath, args, cwd }
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
    const e = event as OpencodeHookEvent
    if (e.event === 'session_completed') return 'Waiting for input'
    if (e.event === 'permission_requested') return 'Needs permission'
    return null
  },

  parseStatus(event: unknown): 'needs_input' | 'idle' | null {
    const e = event as OpencodeHookEvent
    if (e.event === 'session_completed') return 'idle'
    if (e.event === 'permission_requested') return 'needs_input'
    return null
  },
}

/** Restore opencode config on app quit regardless of session count. */
export function cleanupOpencodeConfig() {
  configGuard.forceRestore()
}
