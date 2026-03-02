import type { AgentAdapter, SpawnConfig } from './types'

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

  // No hook support for opencode in v1
  // No title parsing
  // No status detail parsing
  // No session ID capture
}
