export type AgentType = 'claude' | 'codex' | 'opencode'

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
}

export interface AgentAdapter {
  id: AgentType
  name: string
  defaultBinary: string
  settingsKey: string

  buildSpawnConfig(opts: {
    binaryPath: string
    cwd: string
    resumeId?: string
    extraArgs?: string[]
  }): SpawnConfig

  setupHooks?(hookId: string): HookSetup | null

  parseTitle?(title: string): { status: 'running' | 'idle'; name?: string } | null

  parseStatusDetail?(event: unknown): string | null

  parseSessionId?(output: unknown): string | null

  parseStatus?(event: unknown): 'running' | 'idle' | null
}
