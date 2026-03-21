export type AgentType = string

export interface SpawnConfig {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
}

export interface HookSetup {
  extraArgs: string[]
  hookId: string
  statusPath: string
  outputPath?: string
  env?: Record<string, string>
  cleanup: () => void
  /** Called after the agent process is spawned (e.g. to start file watchers). */
  postSpawn?: () => void
}

import type { SessionStatus } from '../../src/types'

export interface AgentAdapter {
  id: AgentType
  name: string
  defaultBinary: string
  settingsKey?: string

  buildSpawnConfig(opts: {
    binaryPath: string
    cwd: string
    extraArgs?: string[]
  }): SpawnConfig

  setupHooks?(hookId: string, hookServerPort?: number): HookSetup | null

  parseTitle?(title: string): { status: 'running' | 'needs_input' | 'idle'; name?: string } | null

  parseStatusDetail?(event: unknown): string | null

  parseStatus?(event: unknown): SessionStatus | null
}
