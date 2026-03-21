import * as path from 'node:path'
import * as fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getAdapter } from './agents/registry'
import { registerHookSession, getHookPort, getLastEvent } from './hookServer'
import type { PtyManager } from './ptyManager'
import type { DaemonClient } from './daemon/client'
import type { HookManager } from './hookManager'
import type { AgentType } from './agents/types'
import type { SessionStatus } from '../src/types'

interface SpawnerDeps {
  ptyManager: PtyManager
  hookManager: HookManager
  daemonClient: DaemonClient
  loadSettings: () => Record<string, unknown>
  hooksDir: string
}

export function createAgentSpawner(deps: SpawnerDeps) {
  const { ptyManager, hookManager, daemonClient, loadSettings, hooksDir } = deps

  // Cache daemon session IDs to avoid per-session round-trips during reattach.
  let cachedDaemonSessionIds: Set<string> | null = null

  async function spawn(name: string, cwd: string, agentType: AgentType): Promise<{ id: string; pid: number; hookId: string }> {
    const settings = loadSettings()
    const adapter = getAdapter(agentType)

    // Resolve command: check agents[] config first, then legacy settingsKey, then defaultBinary
    const agents = (settings.agents ?? []) as Array<{ id: string; command: string }>
    const agentConfig = agents.find((a) => a.id === agentType)
    let rawCommand: string
    if (agentConfig?.command) {
      rawCommand = agentConfig.command.trim()
    } else if (adapter.settingsKey) {
      rawCommand = ((settings[adapter.settingsKey] as string) || adapter.defaultBinary).trim()
    } else {
      rawCommand = adapter.defaultBinary.trim()
    }
    const commandParts = rawCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [rawCommand]
    const binaryPath = commandParts[0]
    const userArgs = commandParts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))
    const hookId = randomUUID()
    const hookPort = getHookPort()

    const hookSetup = adapter.setupHooks?.(hookId, hookPort) ?? null
    const extraArgs = hookSetup?.extraArgs ?? []

    const spawnConfig = adapter.buildSpawnConfig({
      binaryPath,
      cwd,
      extraArgs: [...userArgs, ...extraArgs],
    })

    const mergedEnv = { ...spawnConfig.env, ...hookSetup?.env }
    const hasEnv = Object.keys(mergedEnv).length > 0

    const result = await ptyManager.create(name, spawnConfig.cwd, spawnConfig.command, spawnConfig.args, hasEnv ? mergedEnv : undefined)

    if (hookSetup) {
      registerHookSession(hookId, result.id, agentType)
      hookManager.register(result.id, { hookId, agentType, hookCleanup: hookSetup.cleanup })
      hookSetup.postSpawn?.()
    }

    return { id: result.id, pid: result.pid, hookId }
  }

  async function reattach(sessionId: string, hookId: string, _name: string, _cwd: string, agentType?: AgentType): Promise<{ id: string; scrollbackAvailable: boolean; initialStatus?: SessionStatus; initialStatusDetail?: string | null } | null> {
    if (!daemonClient.isConnected()) return null

    let alive: boolean
    if (cachedDaemonSessionIds) {
      alive = cachedDaemonSessionIds.has(sessionId)
    } else {
      try {
        const daemonSessions = await daemonClient.list()
        alive = daemonSessions.some((s) => s.id === sessionId)
      } catch {
        return null
      }
    }
    if (!alive) return null

    const resolvedAgentType: AgentType = agentType ?? 'claude'
    const adapter = getAdapter(resolvedAgentType)

    ptyManager.registerDaemonSession(sessionId)

    if (hookId) {
      registerHookSession(hookId, sessionId, resolvedAgentType)
      hookManager.register(sessionId, { hookId, agentType: resolvedAgentType })
    }

    let initialStatusDetail: string | null = null
    let initialStatus: SessionStatus | undefined
    let lastHookEvent: unknown | null = null

    if (hookId) {
      lastHookEvent = getLastEvent(hookId)
      if (!lastHookEvent) {
        try {
          const statusPath = path.join(hooksDir, `${hookId}.status`)
          const raw = fs.readFileSync(statusPath, 'utf-8').trim()
          if (raw) lastHookEvent = JSON.parse(raw)
        } catch { /* file missing or malformed */ }
      }
      if (lastHookEvent) {
        initialStatusDetail = adapter.parseStatusDetail?.(lastHookEvent) ?? null
        const hookStatus = adapter.parseStatus?.(lastHookEvent) ?? null
        if (hookStatus) initialStatus = hookStatus
      }
    }

    return {
      id: sessionId,
      scrollbackAvailable: true,
      initialStatus,
      initialStatusDetail,
    }
  }

  function setCachedDaemonSessionIds(ids: Set<string> | null) {
    cachedDaemonSessionIds = ids
  }

  return { spawn, reattach, setCachedDaemonSessionIds }
}
