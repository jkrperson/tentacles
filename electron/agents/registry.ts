import type { AgentAdapter, AgentType } from './types'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { opencodeAdapter } from './opencode'

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
