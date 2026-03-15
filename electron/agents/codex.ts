import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { app } from 'electron'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = path.join(app.getPath('userData'), 'hooks')
const codexConfigPath = path.join(homedir(), '.codex', 'config.toml')
const notifyBackupPath = path.join(hooksDir, 'codex-original-notify.bak')
const notifyScriptPath = path.join(hooksDir, 'codex-notify.sh')

function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
}

/** Track active Codex session count for config.toml restoration. */
let activeCodexSessions = 0

/** Read the current `notify` value from config.toml. Returns null if not set. */
function readNotifyValue(): string | null {
  try {
    if (!fs.existsSync(codexConfigPath)) return null
    const content = fs.readFileSync(codexConfigPath, 'utf-8')
    const match = content.match(/^notify\s*=\s*(.+)$/m)
    if (!match) return null
    return match[1].trim()
  } catch {
    return null
  }
}

/** Write or replace the `notify` line in config.toml. Creates the file if needed. */
function writeNotifyValue(value: string) {
  const codexDir = path.dirname(codexConfigPath)
  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true })
  }

  let content = ''
  try {
    content = fs.readFileSync(codexConfigPath, 'utf-8')
  } catch { /* file doesn't exist yet */ }

  const notifyLine = `notify = ${value}`
  if (/^notify\s*=/m.test(content)) {
    content = content.replace(/^notify\s*=.*$/m, notifyLine)
  } else {
    // Insert before first [section] header, or at end
    const sectionMatch = content.match(/^\[/m)
    if (sectionMatch && sectionMatch.index !== undefined) {
      content = content.slice(0, sectionMatch.index) + notifyLine + '\n' + content.slice(sectionMatch.index)
    } else {
      content = content.trimEnd() + (content.trim() ? '\n' : '') + notifyLine + '\n'
    }
  }

  fs.writeFileSync(codexConfigPath, content)
}

/** Remove the `notify` line from config.toml entirely. */
function removeNotifyLine() {
  try {
    if (!fs.existsSync(codexConfigPath)) return
    let content = fs.readFileSync(codexConfigPath, 'utf-8')
    content = content.replace(/^notify\s*=.*\n?/m, '')
    fs.writeFileSync(codexConfigPath, content)
  } catch { /* ignore */ }
}

/** Restore the original notify config when all Codex sessions end. */
function restoreOriginalNotify() {
  try {
    if (fs.existsSync(notifyBackupPath)) {
      const original = fs.readFileSync(notifyBackupPath, 'utf-8').trim()
      if (original) {
        writeNotifyValue(original)
      } else {
        removeNotifyLine()
      }
      fs.unlinkSync(notifyBackupPath)
    } else {
      removeNotifyLine()
    }
  } catch { /* ignore */ }
}

/** Create the shared notify script that routes events by TENTACLES_HOOK_ID. */
function ensureNotifyScript(hookServerPort?: number) {
  ensureHooksDir()

  const script = hookServerPort
    ? `#!/bin/sh
# Tentacles Codex notify hook — routes events via HTTP.
HOOK_ID="$TENTACLES_HOOK_ID"
if [ -z "$HOOK_ID" ]; then exit 0; fi
curl -s --connect-timeout 1 --max-time 2 -X POST -H "Content-Type: application/json" -d "$1" http://127.0.0.1:${hookServerPort}/hook/$HOOK_ID
`
    : `#!/bin/sh
# Tentacles Codex notify hook — routes agent-turn-complete events per session.
HOOK_ID="$TENTACLES_HOOK_ID"
if [ -z "$HOOK_ID" ]; then exit 0; fi
HOOKS_DIR=${JSON.stringify(hooksDir)}
STATUS_FILE="$HOOKS_DIR/$HOOK_ID.status"
OUT_FILE="$HOOKS_DIR/$HOOK_ID.out"

# Write the event payload to the status file
printf '%s' "$1" > "$STATUS_FILE"

# On first invocation (no .out file), also write for session ID capture
if [ ! -f "$OUT_FILE" ]; then
  printf '%s' "$1" > "$OUT_FILE"
fi
`
  fs.writeFileSync(notifyScriptPath, script, { mode: 0o755 })
}

interface CodexNotifyEvent {
  event?: string
  'thread-id'?: string
  'last-assistant-message'?: string
  cwd?: string
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  name: 'Codex CLI',
  defaultBinary: 'codex',
  settingsKey: 'codexCliPath',

  buildSpawnConfig({ binaryPath, cwd, resumeId, extraArgs = [] }): SpawnConfig {
    const args = resumeId
      ? ['resume', resumeId, ...extraArgs]
      : [...extraArgs]
    return { command: binaryPath, args, cwd }
  },

  setupHooks(hookId: string, hookServerPort?: number): HookSetup {
    ensureHooksDir()
    ensureNotifyScript(hookServerPort)

    const statusPath = path.join(hooksDir, `${hookId}.status`)
    const outputPath = path.join(hooksDir, `${hookId}.out`)

    // Back up existing notify value only on the first Codex session
    if (activeCodexSessions === 0) {
      const currentNotify = readNotifyValue()
      // Save original (empty string means "was not set")
      fs.writeFileSync(notifyBackupPath, currentNotify ?? '')
    }

    // Set notify to our shared script
    writeNotifyValue(JSON.stringify(notifyScriptPath))
    activeCodexSessions++

    return {
      extraArgs: [],
      hookId,
      statusPath,
      outputPath,
      env: { TENTACLES_HOOK_ID: hookId },
      cleanup: () => {
        // Remove per-session hook files
        try { fs.unlinkSync(statusPath) } catch { /* already deleted */ }
        try { fs.unlinkSync(outputPath) } catch { /* already deleted */ }

        activeCodexSessions = Math.max(0, activeCodexSessions - 1)
        // Restore config.toml when no Codex sessions remain
        if (activeCodexSessions === 0) {
          restoreOriginalNotify()
        }
      },
    }
  },

  parseStatusDetail(event: unknown): string | null {
    const e = event as CodexNotifyEvent
    if (e.event !== 'agent-turn-complete') return null

    const msg = e['last-assistant-message']
    if (!msg) return 'Turn complete'

    // First line, truncated to ~60 chars
    const firstLine = msg.split('\n')[0].trim()
    if (firstLine.length > 60) {
      return firstLine.slice(0, 57) + '...'
    }
    return firstLine || 'Turn complete'
  },

  parseSessionId(output: unknown): string | null {
    const data = output as CodexNotifyEvent
    return data['thread-id'] ?? null
  },

  parseStatus(event: unknown): 'running' | 'idle' | null {
    const e = event as CodexNotifyEvent
    // agent-turn-complete means the agent finished its turn and is waiting for input
    if (e.event === 'agent-turn-complete') return 'idle'
    return null
  },
}

/** Restore Codex config.toml on app quit regardless of session count. */
export function cleanupCodexConfig() {
  if (activeCodexSessions > 0) {
    activeCodexSessions = 0
    restoreOriginalNotify()
  }
}
