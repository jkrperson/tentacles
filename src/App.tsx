import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { ConfirmModal } from './components/common/ConfirmModal'
import { SettingsPage } from './components/settings/SettingsPage'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import { useProjectStore } from './stores/projectStore'
import { applyThemeToDOM } from './themes'
import { useResolvedTheme, useCustomThemes } from './hooks/useResolvedTheme'
import { initDataRouter } from './dataRouter'
import { useSessionSubscriptions } from './hooks/useSessionSubscriptions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settings = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSavedSessions = useSessionStore((s) => s.loadSessions)

  useEffect(() => {
    loadSettings()
    loadSavedSessions()
  }, [loadSettings, loadSavedSessions])

  const { customThemes } = useCustomThemes()
  const { theme: resolvedTheme } = useResolvedTheme(settings.theme, customThemes)

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme)
  }, [resolvedTheme])

  // Load projects after settings are loaded
  useEffect(() => {
    if (settingsLoaded) loadProjects()
  }, [settingsLoaded, loadProjects])

  // Initialize the single-listener data router for all terminal panels.
  useEffect(() => {
    return initDataRouter()
  }, [])

  useSessionSubscriptions()
  useKeyboardShortcuts()

  if (isSettingsOpen) {
    return (
      <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
        {/* macOS traffic light area */}
        <div
          className="h-10 flex-shrink-0 flex items-center border-b border-[var(--t-border)]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="w-20" /> {/* space for traffic lights */}
          <span
            className="text-[11px] font-medium text-zinc-500 tracking-wide uppercase select-none"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Tentacles
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <SettingsPage />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
      {/* macOS traffic light area */}
      <div
        className="h-10 flex-shrink-0 flex items-center border-b border-[var(--t-border)]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="w-20" /> {/* space for traffic lights */}
        <span
          className="text-[11px] font-medium text-zinc-500 tracking-wide uppercase select-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Tentacles
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Layout />
      </div>
    </div>
  )
}

export default App
