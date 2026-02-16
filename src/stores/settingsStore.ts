import { create } from 'zustand'
import type { AppSettings } from '../types'

const defaultSettings: AppSettings = {
  maxSessions: 10,
  defaultProjectPath: '',
  claudeCliPath: 'claude',
  desktopNotifications: true,
  soundEnabled: false,
  idleThresholdMs: 3000,
  terminalFontSize: 13,
  terminalFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  projectPaths: [],
  theme: 'obsidian',
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
      const saved = await window.electronAPI.app.getSettings()
      set({ settings: { ...defaultSettings, ...saved }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial }
    set({ settings: merged })
    await window.electronAPI.app.saveSettings(merged)
  },

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}))
