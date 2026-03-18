import { create } from 'zustand'
import { trpc } from '../trpc'
import type { AppSettings } from '../types'
import { DEFAULT_AGENTS } from '../defaultAgents'

const defaultSettings: AppSettings = {
  maxSessions: 10,
  defaultProjectPath: '',
  defaultAgent: 'claude',
  agents: DEFAULT_AGENTS,
  desktopNotifications: true,
  soundEnabled: false,
  notificationSounds: {
    completed: 'builtin:chime',
    needsInput: 'builtin:ping',
    exited: 'none',
  },
  idleThresholdMs: 3000,
  terminalFontSize: 13,
  terminalFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  projectPaths: [],
  theme: 'obsidian',
  enabledLspLanguages: [],
  scrollSpeed: 3,
  enableMediaPanel: false,
}

interface SettingsState {
  settings: AppSettings
  isSettingsOpen: boolean
  loaded: boolean

  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>
  toggleSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isSettingsOpen: false,
  loaded: false,

  loadSettings: async () => {
    try {
      const saved = await trpc.app.getSettings.query() as AppSettings & Record<string, unknown>
      const merged = { ...defaultSettings, ...saved }

      // Migration: convert old *CliPath fields to agents[] if not yet migrated
      if (!saved.agents) {
        const agents = [...DEFAULT_AGENTS]
        if (saved.claudeCliPath && saved.claudeCliPath !== 'claude') {
          const a = agents.find((x) => x.id === 'claude')
          if (a) a.command = saved.claudeCliPath
        }
        if (saved.codexCliPath && saved.codexCliPath !== 'codex') {
          const a = agents.find((x) => x.id === 'codex')
          if (a) a.command = saved.codexCliPath
        }
        if (saved.opencodeCliPath && saved.opencodeCliPath !== 'opencode') {
          const a = agents.find((x) => x.id === 'opencode')
          if (a) a.command = saved.opencodeCliPath
        }
        merged.agents = agents
        // Clean up deprecated fields
        delete merged.claudeCliPath
        delete merged.codexCliPath
        delete merged.opencodeCliPath
      }

      set({ settings: merged, loaded: true })

      // Detect which agents are installed and auto-disable missing ones
      detectInstalledAgents(merged, set)
    } catch {
      set({ loaded: true })
    }
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial }
    set({ settings: merged })
    // Strip runtime-only `installed` field before persisting
    const toSave = {
      ...merged,
      agents: merged.agents.map((a) => {
        const { id, name, command, icon, enabled, pinned } = a
        return { id, name, command, icon, enabled, pinned }
      }),
    }
    await trpc.app.saveSettings.mutate(toSave as unknown as Record<string, unknown>)
  },

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}))

/** Check each agent's command on PATH and update `installed` + auto-disable missing agents. */
async function detectInstalledAgents(
  settings: AppSettings,
  set: (partial: Partial<SettingsState> | ((s: SettingsState) => Partial<SettingsState>)) => void,
) {
  const results = await Promise.all(
    settings.agents.map(async (agent) => {
      if (!agent.command) return { id: agent.id, installed: false }
      try {
        const installed = await trpc.app.checkAgentInstalled.query({ command: agent.command })
        return { id: agent.id, installed }
      } catch {
        return { id: agent.id, installed: false }
      }
    }),
  )

  const installedMap = new Map(results.map((r) => [r.id, r.installed]))

  set((state) => ({
    settings: {
      ...state.settings,
      agents: state.settings.agents.map((agent) => {
        const installed = installedMap.get(agent.id) ?? false
        return {
          ...agent,
          installed,
          // Auto-disable agents that aren't installed (only if this is first-time setup / migration)
          enabled: installed ? agent.enabled : false,
        }
      }),
    },
  }))
}
