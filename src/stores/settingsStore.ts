import { create } from 'zustand'
import { trpc } from '../trpc'
import type { AppSettings } from '../types'

const defaultSettings: AppSettings = {
  maxSessions: 10,
  defaultProjectPath: '',
  defaultAgent: 'claude',
  claudeCliPath: 'claude',
  codexCliPath: 'codex',
  opencodeCliPath: 'opencode',
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
      const saved = await trpc.app.getSettings.query() as AppSettings
      set({ settings: { ...defaultSettings, ...saved }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial }
    set({ settings: merged })
    await trpc.app.saveSettings.mutate(merged as unknown as Record<string, unknown>)
  },

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}))
