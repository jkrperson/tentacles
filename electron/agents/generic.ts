import type { AgentAdapter, SpawnConfig } from './types'

/**
 * Creates a generic AgentAdapter for custom/unknown agent types.
 * No hook integration — just spawns the command in a terminal.
 */
export function createGenericAdapter(id: string, name: string, defaultBinary: string): AgentAdapter {
  return {
    id,
    name,
    defaultBinary,

    buildSpawnConfig({ binaryPath, cwd, extraArgs = [] }): SpawnConfig {
      return { command: binaryPath, args: [...extraArgs], cwd }
    },
  }
}
