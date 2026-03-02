import type { AgentAdapter, SpawnConfig } from './types'

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

  // No hook support for Codex in v1
  // No title parsing — Codex doesn't emit OSC titles
  // No status detail parsing
  // No session ID capture
}
