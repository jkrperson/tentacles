import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { ensureHooksDir, getHooksDir, ConfigGuard } from './shared'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = getHooksDir()
const geminiSettingsDir = path.join(homedir(), '.gemini')
const geminiSettingsPath = path.join(geminiSettingsDir, 'settings.json')
const configBackupPath = path.join(hooksDir, 'gemini-original-settings.bak')

function readGeminiSettings(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(geminiSettingsPath)) return null
    return JSON.parse(fs.readFileSync(geminiSettingsPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeGeminiSettings(config: Record<string, unknown>) {
  if (!fs.existsSync(geminiSettingsDir)) {
    fs.mkdirSync(geminiSettingsDir, { recursive: true })
  }
  fs.writeFileSync(geminiSettingsPath, JSON.stringify(config, null, 2))
}

const configGuard = new ConfigGuard(
  configBackupPath,
  () => {
    const current = readGeminiSettings()
    fs.writeFileSync(configBackupPath, current ? JSON.stringify(current, null, 2) : '')
  },
  () => {
    try {
      if (fs.existsSync(configBackupPath)) {
        const original = fs.readFileSync(configBackupPath, 'utf-8').trim()
        if (original) {
          fs.writeFileSync(geminiSettingsPath, original)
        } else {
          try { fs.unlinkSync(geminiSettingsPath) } catch { /* ignore */ }
        }
        fs.unlinkSync(configBackupPath)
      }
    } catch { /* ignore */ }
  },
)

/**
 * Write a per-session Gemini hook script.
 * Gemini pipes JSON context to stdin and expects `{}` on stdout.
 * We output `{}` immediately, then curl the event to the hook server in the background.
 */
function writeHookScript(hookId: string, hookServerPort?: number): string {
  const scriptPath = path.join(hooksDir, `gemini-${hookId}.sh`)

  const script = hookServerPort
    ? `#!/bin/sh
# Tentacles Gemini hook — read stdin, output {}, notify hook server.
INPUT=$(cat)
printf '{}'
EVENT_NAME="\${1:-unknown}"
curl -s --connect-timeout 1 --max-time 2 -X POST \\
  -H "Content-Type: application/json" \\
  -d "{\\"hook_event_name\\":\\"$EVENT_NAME\\",\\"payload\\":$INPUT}" \\
  "http://127.0.0.1:${hookServerPort}/hook/${hookId}" >/dev/null 2>&1 &
`
    : `#!/bin/sh
# Tentacles Gemini hook — output {} (no hook server available).
cat > /dev/null
printf '{}'
`
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  return scriptPath
}

/** Build a hook command string for a given event name. Quotes path for spaces. */
function hookCommand(scriptPath: string, eventName: string): string {
  return `"${scriptPath}" ${eventName}`
}

/** Inject Tentacles hook entries into Gemini settings. */
function injectHooks(hookId: string, hookServerPort?: number) {
  ensureHooksDir()
  const scriptPath = writeHookScript(hookId, hookServerPort)

  configGuard.acquireSession()

  const config = readGeminiSettings() ?? {}
  const hooks = (config.hooks ?? {}) as Record<string, unknown[]>

  const events = ['BeforeAgent', 'AfterAgent', 'AfterTool']
  for (const event of events) {
    const entries = (hooks[event] ?? []) as Array<{ hooks?: Array<{ type: string; command: string }> }>
    const hasTentacles = entries.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes(scriptPath)),
    )
    if (!hasTentacles) {
      entries.push({
        hooks: [{ type: 'command', command: hookCommand(scriptPath, event) }],
      })
    }
    hooks[event] = entries
  }

  config.hooks = hooks
  writeGeminiSettings(config)
}

/** Remove a session's hooks from Gemini settings and clean up. */
function removeSessionHooks(hookId: string) {
  const scriptPath = path.join(hooksDir, `gemini-${hookId}.sh`)
  try { fs.unlinkSync(scriptPath) } catch { /* already deleted */ }

  if (configGuard.sessionCount <= 1) {
    configGuard.releaseSession()
  } else {
    configGuard.releaseSession()
    try {
      const config = readGeminiSettings()
      if (config) {
        const hooks = (config.hooks ?? {}) as Record<string, unknown[]>
        for (const event of ['BeforeAgent', 'AfterAgent', 'AfterTool']) {
          const entries = (hooks[event] ?? []) as Array<{ hooks?: Array<{ type: string; command: string }> }>
          hooks[event] = entries.filter((entry) =>
            !entry.hooks?.some((h) => h.command?.includes(scriptPath)),
          )
          if ((hooks[event] as unknown[]).length === 0) delete hooks[event]
        }
        config.hooks = hooks
        writeGeminiSettings(config)
      }
    } catch { /* config will be restored when last session ends */ }
  }
}

interface GeminiHookEvent {
  hook_event_name?: string
  payload?: unknown
}

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',
  name: 'Gemini CLI',
  defaultBinary: 'gemini',
  settingsKey: 'geminiCliPath',

  buildSpawnConfig({ binaryPath, cwd, extraArgs = [] }): SpawnConfig {
    return { command: binaryPath, args: [...extraArgs], cwd }
  },

  parseTitle(title: string): { status: 'running' | 'needs_input' | 'idle'; name?: string } | null {
    const firstChar = title.codePointAt(0) ?? 0

    // ✋ U+270B = Action Required (permission prompt)
    if (firstChar === 0x270B) {
      const name = title.replace(/^[\u270B]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim() || undefined
      return { status: 'needs_input', name }
    }

    // ⏳ U+23F3 or spinner patterns = working
    if (firstChar === 0x23F3) {
      const name = title.replace(/^[\u23F3]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim() || undefined
      return { status: 'running', name }
    }

    // ✅ U+2705 = completed/idle
    if (firstChar === 0x2705) {
      const name = title.replace(/^[\u2705]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim() || undefined
      return { status: 'idle', name }
    }

    return null
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
    const e = event as GeminiHookEvent
    const name = e.hook_event_name
    if (name === 'BeforeAgent') return 'Working...'
    if (name === 'AfterAgent') return 'Waiting for input'
    if (name === 'AfterTool') return 'Working...'
    return null
  },

  parseStatus(event: unknown): 'running' | 'idle' | null {
    const e = event as GeminiHookEvent
    const name = e.hook_event_name
    if (name === 'BeforeAgent' || name === 'AfterTool') return 'running'
    if (name === 'AfterAgent') return 'idle'
    return null
  },
}

export function cleanupGeminiConfig() {
  configGuard.forceRestore()
}
