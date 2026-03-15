import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { app } from 'electron'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = path.join(app.getPath('userData'), 'hooks')
const opencodeConfigDir = path.join(homedir(), '.config', 'opencode')
const opencodeConfigPath = path.join(opencodeConfigDir, 'config.json')
const configBackupPath = path.join(hooksDir, 'opencode-original-config.bak')

function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
}

/** Track active opencode session count for config restoration. */
let activeOpencodeSessions = 0

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

/** Restore the original opencode config when all sessions end. */
function restoreOriginalConfig() {
  try {
    if (fs.existsSync(configBackupPath)) {
      const original = fs.readFileSync(configBackupPath, 'utf-8').trim()
      if (original) {
        fs.writeFileSync(opencodeConfigPath, original)
      } else {
        // Original was empty/nonexistent — remove our config
        try { fs.unlinkSync(opencodeConfigPath) } catch { /* ignore */ }
      }
      fs.unlinkSync(configBackupPath)
    }
  } catch { /* ignore */ }
}

interface OpencodeHookEvent {
  event?: string
}

/**
 * Inject Tentacles hooks into opencode's experimental.hook config.
 * Each session gets its own hookId passed via the TENTACLES_HOOK_ID environment variable.
 * Since all opencode sessions share a single global config file, we add a single hook entry
 * per event type that uses the TENTACLES_HOOK_ID env var to route events.
 *
 * NOTE: Unlike Codex where each session gets unique env via PTY env, opencode hooks
 * get their env from the config file. Since the config is shared, we use a per-session
 * script approach: each session gets its own script that has the hookId baked in.
 */
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

  // Back up existing config only on the first opencode session
  if (activeOpencodeSessions === 0) {
    const currentConfig = readOpencodeConfig()
    fs.writeFileSync(configBackupPath, currentConfig ? JSON.stringify(currentConfig, null, 2) : '')
  }

  // Read or create config, inject hooks
  const config = readOpencodeConfig() ?? {}
  const experimental = (config.experimental ?? {}) as Record<string, unknown>
  const hook = (experimental.hook ?? {}) as Record<string, unknown[]>

  // Add session_completed hook
  const sessionCompletedHooks = (hook.session_completed ?? []) as Array<{ command: string[]; environment?: Record<string, string> }>
  // Check if we already have a tentacles hook for this hookId
  const hasTentaclesHook = sessionCompletedHooks.some(h => h.command?.[0] === sessionScriptPath)
  if (!hasTentaclesHook) {
    sessionCompletedHooks.push({
      command: [sessionScriptPath],
      environment: { TENTACLES_EVENT_TYPE: 'session_completed' },
    })
  }
  hook.session_completed = sessionCompletedHooks

  // Add permission_requested hook if supported (experimental, from PR #1495)
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
  activeOpencodeSessions++
}

/** Remove a session's hooks from the config and clean up. */
function removeSessionHooks(hookId: string) {
  const sessionScriptPath = path.join(hooksDir, `opencode-${hookId}.sh`)

  // Remove per-session script
  try { fs.unlinkSync(sessionScriptPath) } catch { /* already deleted */ }

  activeOpencodeSessions = Math.max(0, activeOpencodeSessions - 1)

  if (activeOpencodeSessions === 0) {
    restoreOriginalConfig()
  } else {
    // Remove this session's hooks from the shared config
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
    // session_completed = agent finished its turn, waiting for new prompt
    if (e.event === 'session_completed') return 'idle'
    // permission_requested = agent blocked on permission approval
    if (e.event === 'permission_requested') return 'needs_input'
    return null
  },

  // No session ID capture — opencode doesn't pass session context to hooks
  // No title parsing — opencode doesn't emit OSC title sequences
}

/** Restore opencode config on app quit regardless of session count. */
export function cleanupOpencodeConfig() {
  if (activeOpencodeSessions > 0) {
    activeOpencodeSessions = 0
    restoreOriginalConfig()
  }
}
