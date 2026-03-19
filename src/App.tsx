import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { ConfirmModal } from './components/common/ConfirmModal'
import { ShortcutOverlay } from './components/ShortcutOverlay'
import { SettingsPage } from './components/settings/SettingsPage'
import { LoginScreen } from './components/auth/LoginScreen'
import { UserAvatar } from './components/auth/UserAvatar'
import { useAuthStore } from './stores/authStore'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import { useProjectStore } from './stores/projectStore'
import { applyThemeToDOM } from './themes'
import { useResolvedTheme, useCustomThemes } from './hooks/useResolvedTheme'
import { initDataRouter } from './dataRouter'
import { useSessionSubscriptions } from './hooks/useSessionSubscriptions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSoundPlayer } from './hooks/useSoundPlayer'

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settings = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSavedSessions = useSessionStore((s) => s.loadSessions)

  const user = useAuthStore((s) => s.user)
  const authInitialized = useAuthStore((s) => s.initialized)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const subscribeToAuthChanges = useAuthStore((s) => s.subscribeToAuthChanges)

  // Check auth on mount and subscribe to changes
  useEffect(() => {
    checkAuth()
    return subscribeToAuthChanges()
  }, [checkAuth, subscribeToAuthChanges])

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
  useSoundPlayer()

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
      <ConfirmModal />
      <ShortcutOverlay />
      {/* Login modal overlay */}
      {authInitialized && !user && <LoginScreen />}
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
        <div className="flex-1" />
        <div className="pr-3">
          <UserAvatar />
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0" style={{ display: isSettingsOpen ? 'none' : undefined }}>
          <Layout />
        </div>
        <div className="absolute inset-0" style={{ display: isSettingsOpen ? undefined : 'none' }}>
          <SettingsPage />
        </div>
      </div>
    </div>
  )
}

export default App
