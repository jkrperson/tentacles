import type { AgentConfig } from './types'

export const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', icon: 'claude', enabled: true, pinned: true },
  { id: 'codex', name: 'Codex CLI', command: 'codex', icon: 'codex', enabled: true, pinned: true },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', icon: 'gemini', enabled: true, pinned: true },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor', icon: 'cursor', enabled: true, pinned: true },
  { id: 'opencode', name: 'opencode', command: 'opencode', icon: 'generic', enabled: false, pinned: false },
]
