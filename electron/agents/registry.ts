import type { AgentAdapter, AgentType } from './types'
import { claudeAdapter } from './claude'
import { codexAdapter, cleanupCodexConfig } from './codex'
import { opencodeAdapter, cleanupOpencodeConfig } from './opencode'

const adapters: Record<AgentType, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
}

export function getAdapter(type: AgentType): AgentAdapter {
  return adapters[type]
}

export function getAllAdapters(): AgentAdapter[] {
  return Object.values(adapters)
}

/** Restore all agent config files on app quit. */
export function cleanupAllAdapters() {
  cleanupCodexConfig()
  cleanupOpencodeConfig()
}
