import type { AgentAdapter, AgentType } from './types'
import { claudeAdapter } from './claude'
import { codexAdapter, cleanupCodexConfig } from './codex'
import { opencodeAdapter, cleanupOpencodeConfig } from './opencode'
import { createGenericAdapter } from './generic'

const builtinAdapters: Record<string, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
}

export function getAdapter(type: AgentType): AgentAdapter {
  if (builtinAdapters[type]) return builtinAdapters[type]
  // Return a generic adapter for unknown/custom agent types
  return createGenericAdapter(type, type, type)
}

export function getAllAdapters(): AgentAdapter[] {
  return Object.values(builtinAdapters)
}

/** Restore all agent config files on app quit. */
export function cleanupAllAdapters() {
  cleanupCodexConfig()
  cleanupOpencodeConfig()
}
