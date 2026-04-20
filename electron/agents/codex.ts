import * as path from 'node:path'
import * as fs from 'node:fs'
import * as http from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { ensureHooksDir, getHooksDir, ConfigGuard } from './shared'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const codexConfigPath = path.join(homedir(), '.codex', 'config.toml')
const hooksDir = getHooksDir()
const notifyBackupPath = path.join(hooksDir, 'codex-original-notify.bak')
const notifyScriptPath = path.join(hooksDir, 'codex-notify.sh')

// ---------------------------------------------------------------------------
// config.toml notify management (kept for agent-turn-complete events)
// ---------------------------------------------------------------------------

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
    const sectionMatch = content.match(/^\[/m)
    if (sectionMatch && sectionMatch.index !== undefined) {
      content = content.slice(0, sectionMatch.index) + notifyLine + '\n' + content.slice(sectionMatch.index)
    } else {
      content = content.trimEnd() + (content.trim() ? '\n' : '') + notifyLine + '\n'
    }
  }

  fs.writeFileSync(codexConfigPath, content)
}

function removeNotifyLine() {
  try {
    if (!fs.existsSync(codexConfigPath)) return
    let content = fs.readFileSync(codexConfigPath, 'utf-8')
    content = content.replace(/^notify\s*=.*\n?/m, '')
    fs.writeFileSync(codexConfigPath, content)
  } catch { /* ignore */ }
}

const configGuard = new ConfigGuard(
  notifyBackupPath,
  () => {
    const currentNotify = readNotifyValue()
    fs.writeFileSync(notifyBackupPath, currentNotify ?? '')
  },
  () => {
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
  },
)

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

// ---------------------------------------------------------------------------
// JSONL session log watcher (for running / permission_request detection)
// ---------------------------------------------------------------------------

function postToHookServer(port: number, hookId: string, event: Record<string, unknown>) {
  const data = JSON.stringify(event)
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: `/hook/${hookId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 2000,
  }, () => { /* discard response */ })
  req.on('error', () => { /* non-critical */ })
  req.write(data)
  req.end()
}

/**
 * Start watching a Codex JSONL session log file for lifecycle events.
 * Returns a cleanup function that stops the watcher.
 */
function startSessionLogWatcher(sessionLogPath: string, hookServerPort: number, hookId: string): () => void {
  let filePosition = 0
  let watcherTimer: ReturnType<typeof setInterval> | null = null

  const processNewLines = () => {
    try {
      const stat = fs.statSync(sessionLogPath)
      if (stat.size <= filePosition) return

      const fd = fs.openSync(sessionLogPath, 'r')
      const buf = Buffer.alloc(stat.size - filePosition)
      fs.readSync(fd, buf, 0, buf.length, filePosition)
      fs.closeSync(fd)
      filePosition = stat.size

      const lines = buf.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as {
            kind?: string
            dir?: string
            payload?: { msg?: { type?: string } }
          }

          // Codex JSONL structure: { kind: "codex_event", dir: "to_tui", payload: { msg: { type: "task_started" } } }
          const msgType = parsed.payload?.msg?.type
          if (!msgType) continue

          if (
            msgType === 'task_started' ||
            msgType === 'task_complete' ||
            msgType === 'exec_command_begin' ||
            msgType.includes('approval_request')
          ) {
            postToHookServer(hookServerPort, hookId, {
              source: 'session_log',
              msg_type: msgType,
            })
          }
        } catch { /* malformed JSON line, skip */ }
      }
    } catch { /* file may not exist yet or be locked */ }
  }

  // Poll every 200ms for new data
  watcherTimer = setInterval(processNewLines, 200)

  return () => {
    if (watcherTimer) {
      clearInterval(watcherTimer)
      watcherTimer = null
    }
  }
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

interface CodexEvent {
  // Notify events — codex sends `type` (not `event`)
  type?: string
  event?: string
  'thread-id'?: string
  'last-assistant-message'?: string
  cwd?: string
  // Session log events (posted by our watcher)
  source?: 'session_log'
  msg_type?: string
  payload?: { msg?: { type?: string } }
}

function getEventName(e: CodexEvent): string {
  return String(e.type ?? e.event ?? '').toLowerCase()
}

function getSessionLogMsgType(e: CodexEvent): string {
  return String(e.msg_type ?? e.payload?.msg?.type ?? '').toLowerCase()
}

function classifySessionLogStatus(msgType: string): 'running' | 'needs_input' | 'idle' | null {
  if (!msgType) return null
  if (msgType.includes('approval_request') || msgType.includes('permission_request')) return 'needs_input'
  if (
    msgType.includes('task_started') ||
    msgType.includes('exec_command_begin') ||
    msgType.includes('command_started') ||
    msgType.includes('turn_started')
  ) return 'running'
  if (
    msgType.includes('task_complete') ||
    msgType.includes('task_completed') ||
    msgType.includes('task_finished') ||
    msgType.includes('turn_complete')
  ) return 'idle'
  return null
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  name: 'Codex CLI',
  defaultBinary: 'codex',
  settingsKey: 'codexCliPath',

  buildSpawnConfig({ binaryPath, cwd, extraArgs = [] }): SpawnConfig {
    return { command: binaryPath, args: [...extraArgs], cwd }
  },

  setupHooks(hookId: string, hookServerPort?: number): HookSetup {
    ensureHooksDir()
    ensureNotifyScript(hookServerPort)

    const statusPath = path.join(hooksDir, `${hookId}.status`)
    const outputPath = path.join(hooksDir, `${hookId}.out`)
    const sessionLogPath = path.join(tmpdir(), `tentacles-codex-${hookId}.jsonl`)

    // Create the session log file so Codex can write to it
    fs.writeFileSync(sessionLogPath, '')

    configGuard.acquireSession()
    writeNotifyValue(`[${JSON.stringify(notifyScriptPath)}]`)

    let stopWatcher: (() => void) | null = null

    return {
      extraArgs: [],
      hookId,
      statusPath,
      outputPath,
      env: {
        TENTACLES_HOOK_ID: hookId,
        CODEX_TUI_RECORD_SESSION: '1',
        CODEX_TUI_SESSION_LOG_PATH: sessionLogPath,
      },
      postSpawn: () => {
        if (hookServerPort) {
          stopWatcher = startSessionLogWatcher(sessionLogPath, hookServerPort, hookId)
        }
      },
      cleanup: () => {
        stopWatcher?.()
        try { fs.unlinkSync(sessionLogPath) } catch { /* already deleted */ }
        try { fs.unlinkSync(statusPath) } catch { /* already deleted */ }
        try { fs.unlinkSync(outputPath) } catch { /* already deleted */ }
        configGuard.releaseSession()
      },
    }
  },

  parseStatusDetail(event: unknown): string | null {
    const e = event as CodexEvent

    // Session log events (from our JSONL watcher)
    if (e.source === 'session_log') {
      const msgType = getSessionLogMsgType(e)
      if (msgType.includes('approval_request') || msgType.includes('permission_request')) return 'Needs permission'
      if (msgType.includes('exec_command_begin') || msgType.includes('command_started')) return 'Running command'
      if (msgType.includes('task_started') || msgType.includes('turn_started')) return 'Working...'
      if (msgType.includes('task_complete') || msgType.includes('task_completed') || msgType.includes('task_finished') || msgType.includes('turn_complete')) return 'Turn complete'
      return null
    }

    // Notify events — codex uses `type` field (not `event`)
    const eventName = getEventName(e)
    if (eventName === 'agent-turn-complete' || eventName === 'agent_turn_complete') {
      const msg = e['last-assistant-message']
      if (!msg) return 'Turn complete'

      const firstLine = msg.split('\n')[0].trim()
      if (firstLine.length > 60) {
        return firstLine.slice(0, 57) + '...'
      }
      return firstLine || 'Turn complete'
    }

    return null
  },

  parseStatus(event: unknown): 'running' | 'needs_input' | 'idle' | null {
    const e = event as CodexEvent

    // Session log events (from our JSONL watcher)
    if (e.source === 'session_log') {
      return classifySessionLogStatus(getSessionLogMsgType(e))
    }

    // Notify events — codex uses `type` field (not `event`)
    const eventName = getEventName(e)
    if (eventName === 'agent-turn-complete' || eventName === 'agent_turn_complete') return 'idle'
    return null
  },

  parseTitle(title: string): { status: 'running' | 'needs_input' | 'idle'; name?: string } | null {
    const firstChar = title.codePointAt(0) ?? 0
    const lower = title.toLowerCase()

    // Spinner-like prefixes
    const isBrailleSpinner = firstChar >= 0x2800 && firstChar <= 0x28ff
    const isHourglass = firstChar === 0x23f3 // ⏳
    const isNeedsInput = firstChar === 0x270b || lower.includes('needs permission') || lower.includes('awaiting approval')
    const isIdle = firstChar === 0x2705 || lower.includes('turn complete') || lower.includes('completed')

    const name = title
      .replace(/^[\u2800-\u28ff\u23f3\u270b\u2705]\s*/, '')
      .replace(/\s*\(.*\)\s*$/, '')
      .trim() || undefined

    if (isNeedsInput) return { status: 'needs_input', name }
    if (isBrailleSpinner || isHourglass || lower.includes('running') || lower.includes('working')) return { status: 'running', name }
    if (isIdle) return { status: 'idle', name }
    return null
  },
}

/** Restore Codex config.toml on app quit regardless of session count. */
export function cleanupCodexConfig() {
  configGuard.forceRestore()
}
