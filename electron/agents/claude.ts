import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'
import type { AgentAdapter, HookSetup, SpawnConfig } from './types'

const hooksDir = path.join(app.getPath('userData'), 'hooks')

function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
}

interface HookEvent {
  hook_event_name?: string
  tool_name?: string
  tool_input?: Record<string, string>
}

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  name: 'Claude Code',
  defaultBinary: 'claude',
  settingsKey: 'claudeCliPath',

  buildSpawnConfig({ binaryPath, cwd, resumeId, extraArgs = [] }): SpawnConfig {
    const args = resumeId
      ? ['--resume', resumeId, ...extraArgs]
      : [...extraArgs]
    return { command: binaryPath, args, cwd }
  },

  setupHooks(hookId: string): HookSetup {
    ensureHooksDir()
    const outputPath = path.join(hooksDir, `${hookId}.out`)
    const statusPath = path.join(hooksDir, `${hookId}.status`)
    const settingsPath = path.join(hooksDir, `${hookId}.json`)

    const statusCmd = `sh -c 'cat > ${JSON.stringify(statusPath)}'`
    const settings = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: 'command' as const, command: `sh -c 'cat > ${JSON.stringify(outputPath)}'` }],
          },
        ],
        PreToolUse: [
          { hooks: [{ type: 'command' as const, command: statusCmd }] },
        ],
        PostToolUse: [
          { hooks: [{ type: 'command' as const, command: statusCmd }] },
        ],
        Stop: [
          { hooks: [{ type: 'command' as const, command: statusCmd }] },
        ],
        PermissionRequest: [
          { hooks: [{ type: 'command' as const, command: statusCmd }] },
        ],
      },
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))

    return {
      extraArgs: ['--settings', settingsPath],
      hookId,
      statusPath,
      outputPath,
      cleanup: () => {
        try { fs.unlinkSync(settingsPath) } catch { /* already deleted */ }
        try { fs.unlinkSync(outputPath) } catch { /* already deleted */ }
        try { fs.unlinkSync(statusPath) } catch { /* already deleted */ }
      },
    }
  },

  parseTitle(title: string): { status: 'running' | 'idle'; name?: string } | null {
    const firstChar = title.codePointAt(0) ?? 0
    const isBrailleSpinner = firstChar >= 0x2800 && firstChar <= 0x28FF
    const isIdle = firstChar === 0x2733 // ✳

    if (isBrailleSpinner) {
      const name = title.replace(/^[\u2800-\u28FF]\s*/, '') || undefined
      return { status: 'running', name }
    }
    if (isIdle) {
      const name = title.replace(/^\u2733\s*/, '') || undefined
      return { status: 'idle', name }
    }
    return null
  },

  parseStatusDetail(event: unknown): string | null {
    const e = event as HookEvent
    const hookName = e.hook_event_name
    const toolName = e.tool_name
    const toolInput = e.tool_input

    if (hookName === 'Stop') return null

    if (hookName === 'PermissionRequest') {
      return toolName ? `Needs permission: ${toolName}` : 'Needs permission'
    }

    if (hookName === 'PostToolUse') return 'Thinking...'

    if (hookName === 'PreToolUse') {
      if (toolName === 'Bash') {
        return toolInput?.description || 'Running command'
      }
      if (toolName === 'Edit') {
        const file = toolInput?.file_path
        return file ? `Editing ${path.basename(file)}` : 'Editing file'
      }
      if (toolName === 'Write') {
        const file = toolInput?.file_path
        return file ? `Writing ${path.basename(file)}` : 'Writing file'
      }
      if (toolName === 'Read') {
        const file = toolInput?.file_path
        return file ? `Reading ${path.basename(file)}` : 'Reading file'
      }
      if (toolName === 'Grep') return 'Searching code'
      if (toolName === 'Glob') return 'Finding files'
      if (toolName === 'Task') {
        const subagent = toolInput?.subagent_type
        return subagent ? `Running ${subagent}` : 'Running subagent'
      }
      if (toolName === 'WebFetch') return 'Fetching web page'
      if (toolName === 'WebSearch') return 'Searching web'
      if (toolName?.startsWith('mcp__')) {
        const segments = toolName.split('__')
        const toolSegment = segments[segments.length - 1] || toolName
        return `Using ${toolSegment}`
      }
      return toolName ? `Using ${toolName}` : 'Working...'
    }

    return null
  },

  parseSessionId(output: unknown): string | null {
    const data = output as { session_id?: string }
    return data.session_id ?? null
  },
}
