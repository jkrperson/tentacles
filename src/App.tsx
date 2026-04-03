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
import { capture, identifyUser, resetUser } from './lib/posthog'
import { useSessionSubscriptions } from './hooks/useSessionSubscriptions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSoundPlayer } from './hooks/useSoundPlayer'
import { useUIStore } from './stores/uiStore'
import { UpdateBanner } from './components/UpdateBanner'
import { DictationOverlay } from './components/DictationOverlay'
import { useAgentChatSubscriptions } from './hooks/useAgentChatSubscriptions'

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settings = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSavedSessions = useSessionStore((s) => s.loadSessions)
  const centerView = useUIStore((s) => s.centerView)
  const openTodosPage = useUIStore((s) => s.openTodosPage)
  const openTerminalView = useUIStore((s) => s.openTerminalView)
  const toggleAgentChat = useUIStore((s) => s.toggleAgentChat)

  const user = useAuthStore((s) => s.user)
  const authInitialized = useAuthStore((s) => s.initialized)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const subscribeToAuthChanges = useAuthStore((s) => s.subscribeToAuthChanges)

  // Check auth on mount and subscribe to changes
  useEffect(() => {
    checkAuth()
    return subscribeToAuthChanges()
  }, [checkAuth, subscribeToAuthChanges])

  // Track app launch once
  useEffect(() => {
    capture('app_launched')
  }, [])

  // Identify/reset user for telemetry
  useEffect(() => {
    if (user) {
      identifyUser(user.id, { login: user.login })
    } else if (authInitialized) {
      resetUser()
    }
  }, [user, authInitialized])

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

  // Load projects and restore UI preferences after settings are loaded
  useEffect(() => {
    if (!settingsLoaded) return
    loadProjects()
    // Restore persisted sidebar view mode
    const saved = useSettingsStore.getState().settings.sidebarViewMode
    if (saved) useUIStore.getState().setSidebarViewMode(saved)
  }, [settingsLoaded, loadProjects])

  // Initialize the single-listener data router for all terminal panels.
  useEffect(() => {
    return initDataRouter()
  }, [])

  useSessionSubscriptions()
  useKeyboardShortcuts()
  useSoundPlayer()
  useAgentChatSubscriptions()

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
      <ConfirmModal />
      <ShortcutOverlay />
      <DictationOverlay />
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
        {/* Center tabs */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={openTerminalView}
            className={`flex items-center gap-1.5 text-[11px] font-medium select-none px-2.5 py-1 rounded transition-colors ${
              centerView !== 'todos' && centerView !== 'agentChat'
                ? 'text-zinc-200 bg-zinc-700/60'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .354.146L7.707 5H13.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-9z"/>
            </svg>
            Projects
          </button>
          <button
            onClick={openTodosPage}
            className={`flex items-center gap-1.5 text-[11px] font-medium select-none px-2.5 py-1 rounded transition-colors ${
              centerView === 'todos'
                ? 'text-zinc-200 bg-zinc-700/60'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V3A1.5 1.5 0 0 0 12 1.5H4zM5 5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1zm0 2.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1zM5 10h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1z"/>
            </svg>
            Tasks
          </button>
          <button
            onClick={toggleAgentChat}
            className={`flex items-center gap-1.5 text-[11px] font-medium select-none px-2.5 py-1 rounded transition-colors ${
              centerView === 'agentChat'
                ? 'text-zinc-200 bg-zinc-700/60'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 3V3z" />
            </svg>
            Agent
          </button>
        </div>
        <div className="flex-1" />
        <div className="pr-3">
          <UserAvatar />
        </div>
      </div>
      <UpdateBanner />
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
