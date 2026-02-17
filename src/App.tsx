import { useEffect, useCallback, useRef } from 'react'
import { Layout } from './components/Layout'
import { ToastContainer } from './components/notifications/ToastContainer'
import { SettingsModal } from './components/settings/SettingsModal'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import { useNotificationStore } from './stores/notificationStore'
import { useProjectStore } from './stores/projectStore'
import { useTerminalStore } from './stores/terminalStore'
import { themes, applyThemeToDOM } from './themes'

function App() {
  const setHasUnread = useSessionStore((s) => s.setHasUnread)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const updateStatus = useSessionStore((s) => s.updateStatus)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const addSession = useSessionStore((s) => s.addSession)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settings = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const notify = useNotificationStore((s) => s.notify)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const addTerminal = useTerminalStore((s) => s.addTerminal)
  const terminalOrder = useTerminalStore((s) => s.terminalOrder)
  const updateTerminalStatus = useTerminalStore((s) => s.updateTerminalStatus)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)
  const renameSession = useSessionStore((s) => s.renameSession)
  const setClaudeSessionId = useSessionStore((s) => s.setClaudeSessionId)
  const setStatusDetail = useSessionStore((s) => s.setStatusDetail)
  const restoreSession = useSessionStore((s) => s.restoreSession)
  const loadSavedSessions = useSessionStore((s) => s.loadSessions)
  const activeSessionRef = useRef(activeSessionId)
  activeSessionRef.current = activeSessionId

  useEffect(() => {
    loadSettings()
    loadSavedSessions()
  }, [loadSettings, loadSavedSessions])

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    const theme = themes[settings.theme] ?? themes.obsidian
    applyThemeToDOM(theme)
  }, [settings.theme])

  // Load projects after settings are loaded
  useEffect(() => {
    if (settingsLoaded) loadProjects()
  }, [settingsLoaded, loadProjects])

  // Mark incoming data as unread
  useEffect(() => {
    const unsub = window.electronAPI.session.onData(({ id }) => {
      if (id !== activeSessionRef.current) {
        setHasUnread(id, true)
      }
    })
    return unsub
  }, [setHasUnread])

  // Listen for OSC title changes — detect status from leading symbol + rename sessions
  // Claude Code titles: "⠶ Task Name" (running/spinner) or "✳ Task Name" (idle/waiting)
  // Braille spinner chars are U+2800–U+28FF, idle symbol is ✳ (U+2733)
  useEffect(() => {
    const unsub = window.electronAPI.session.onTitle(({ id, title }) => {
      const session = useSessionStore.getState().sessions.get(id)
      if (!session || session.status === 'completed' || session.status === 'errored') return

      // Parse leading status symbol
      const firstChar = title.codePointAt(0) ?? 0
      const isBrailleSpinner = firstChar >= 0x2800 && firstChar <= 0x28FF
      const isIdleSymbol = firstChar === 0x2733 // ✳

      if (isBrailleSpinner && session.status !== 'running') {
        updateStatus(id, 'running')
      } else if (isIdleSymbol && session.status !== 'idle') {
        updateStatus(id, 'idle')
        const cleanName = title.replace(/^[\u2800-\u28FF\u2733]\s*/, '') || session.name
        notify('info', `${cleanName} is waiting`, 'Claude is waiting for input', id)
      }

      // Strip the symbol prefix for a clean session name
      const cleanTitle = title.replace(/^[\u2800-\u28FF\u2733]\s*/, '')
      if (cleanTitle && cleanTitle !== session.name) {
        renameSession(id, cleanTitle)
      }
    })
    return unsub
  }, [renameSession, updateStatus, notify])

  useEffect(() => {
    if (activeSessionId) {
      setHasUnread(activeSessionId, false)
    }
  }, [activeSessionId, setHasUnread])

  // Listen for session exits — uses store.getState() to avoid re-subscribing on session changes
  useEffect(() => {
    const unsub = window.electronAPI.session.onExit(({ id, exitCode }) => {
      const status = exitCode === 0 ? 'completed' : 'errored'
      updateStatus(id, status, exitCode)
      const session = useSessionStore.getState().sessions.get(id)
      notify(
        exitCode === 0 ? 'success' : 'error',
        `${session?.name ?? 'Agent'} finished`,
        `Exit code: ${exitCode}`,
        id,
      )
    })
    return unsub
  }, [updateStatus, notify])

  // Capture Claude CLI session ID for resume support
  useEffect(() => {
    const unsub = window.electronAPI.session.onClaudeSessionId(({ id, claudeSessionId }) => {
      setClaudeSessionId(id, claudeSessionId)
    })
    return unsub
  }, [setClaudeSessionId])

  // Listen for detailed status updates from hook events
  useEffect(() => {
    const unsub = window.electronAPI.session.onStatusDetail(({ id, detail }) => {
      setStatusDetail(id, detail)
    })
    return unsub
  }, [setStatusDetail])

  // Switch active terminal when project changes
  useEffect(() => {
    const { terminals, terminalOrder: tOrder, activeTerminalId } = useTerminalStore.getState()
    // If the current active terminal already belongs to this project, keep it
    if (activeTerminalId && terminals.get(activeTerminalId)?.cwd === activeProjectId) return
    // Otherwise find the first terminal in this project, or null
    const match = activeProjectId
      ? tOrder.find((id) => terminals.get(id)?.cwd === activeProjectId) ?? null
      : tOrder[0] ?? null
    setActiveTerminal(match)
  }, [activeProjectId, setActiveTerminal])

  // Listen for shell terminal exits
  useEffect(() => {
    const unsub = window.electronAPI.terminal.onExit(({ id, exitCode }) => {
      updateTerminalStatus(id, exitCode)
    })
    return unsub
  }, [updateTerminalStatus])

  const handleNewSession = useCallback(async () => {
    if (sessionOrder.length >= settings.maxSessions) {
      notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
      return
    }

    let cwd = activeProjectId
    if (!cwd) {
      // No active project — open directory picker
      const dir = await window.electronAPI.dialog.selectDirectory()
      if (!dir) return
      addProject(dir)
      cwd = dir
    }

    const name = `Agent ${sessionOrder.length + 1}`
    try {
      const { id, pid } = await window.electronAPI.session.create(name, cwd)
      addSession({
        id,
        name,
        cwd,
        status: 'running',
        createdAt: Date.now(),
        hasUnread: false,
        pid,
      })
      addProject(cwd) // ensure project exists + activate
    } catch (err: unknown) {
      notify('error', 'Failed to spawn agent', err instanceof Error ? err.message : String(err))
    }
  }, [sessionOrder.length, settings, activeProjectId, addSession, addProject, notify])

  const handleNewSessionInProject = useCallback(async (projectPath: string) => {
    if (sessionOrder.length >= settings.maxSessions) {
      notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
      return
    }
    const name = `Agent ${sessionOrder.length + 1}`
    try {
      const { id, pid } = await window.electronAPI.session.create(name, projectPath)
      addSession({
        id,
        name,
        cwd: projectPath,
        status: 'running',
        createdAt: Date.now(),
        hasUnread: false,
        pid,
      })
      setActiveProject(projectPath)
    } catch (err: unknown) {
      notify('error', 'Failed to spawn agent', err instanceof Error ? err.message : String(err))
    }
  }, [sessionOrder.length, settings, addSession, setActiveProject, notify])

  const handleNewSessionInWorktree = useCallback(async (projectPath: string, worktreeName?: string) => {
    if (sessionOrder.length >= settings.maxSessions) {
      notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
      return
    }
    try {
      const { worktreePath, branch } = await window.electronAPI.git.worktree.create(projectPath, worktreeName)
      const name = worktreeName || `Agent ${sessionOrder.length + 1}`
      const { id, pid } = await window.electronAPI.session.create(name, worktreePath)
      addSession({
        id,
        name,
        cwd: worktreePath,
        status: 'running',
        createdAt: Date.now(),
        hasUnread: false,
        pid,
        isWorktree: true,
        worktreePath,
        worktreeBranch: branch,
        originalRepo: projectPath,
      })
      setActiveProject(projectPath)
    } catch (err: unknown) {
      notify('error', 'Failed to create worktree', err instanceof Error ? err.message : String(err))
    }
  }, [sessionOrder.length, settings, addSession, setActiveProject, notify])

  const handleResumeSession = useCallback(async (archivedSessionId: string) => {
    const archived = restoreSession(archivedSessionId)
    if (!archived) {
      notify('error', 'Cannot resume', 'Session not found in archive')
      return
    }
    if (!archived.claudeSessionId) {
      notify('warning', 'Cannot resume', 'No Claude session ID available')
      return
    }
    try {
      const { id, pid } = await window.electronAPI.session.resume(
        archived.claudeSessionId,
        archived.name,
        archived.cwd,
      )
      addSession({
        id,
        name: archived.name,
        cwd: archived.cwd,
        status: 'running',
        createdAt: Date.now(),
        hasUnread: false,
        pid,
        claudeSessionId: archived.claudeSessionId,
        isWorktree: archived.isWorktree,
        worktreePath: archived.worktreePath,
        worktreeBranch: archived.worktreeBranch,
        originalRepo: archived.originalRepo,
      })
      setActiveProject(archived.originalRepo ?? archived.cwd)
    } catch (err: unknown) {
      notify('error', 'Failed to resume session', err instanceof Error ? err.message : String(err))
    }
  }, [restoreSession, addSession, setActiveProject, notify])

  const handleNewTerminal = useCallback(async () => {
    let cwd = activeProjectId
    if (!cwd) {
      const dir = await window.electronAPI.dialog.selectDirectory()
      if (!dir) return
      addProject(dir)
      cwd = dir
    }

    const name = `Terminal ${terminalOrder.length + 1}`
    try {
      const { id, pid } = await window.electronAPI.terminal.create(name, cwd)
      addTerminal({
        id,
        name,
        cwd,
        status: 'running',
        createdAt: Date.now(),
        pid,
      })
    } catch (err: unknown) {
      notify('error', 'Failed to spawn terminal', err instanceof Error ? err.message : String(err))
    }
  }, [terminalOrder.length, activeProjectId, addTerminal, addProject, notify])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 't') {
        e.preventDefault()
        handleNewSession()
      }

      // Ctrl+` — new shell terminal (like VS Code)
      if (meta && e.key === '`') {
        e.preventDefault()
        handleNewTerminal()
      }

      if (meta && e.key === 'w') {
        e.preventDefault()
        const { activeSessionId: aid, sessions: sess, removeSession: rm } = useSessionStore.getState()
        if (aid) {
          const session = sess.get(aid)
          if (session?.status === 'running' || session?.status === 'idle') {
            window.electronAPI.session.kill(aid)
          }
          rm(aid)
        }
      }

      if (meta && e.key === ',') {
        e.preventDefault()
        toggleSettings()
      }

      // Cmd+1-9: cycle through sessions within the active project
      if (meta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
        const apId = useProjectStore.getState().activeProjectId
        const projectSessions = apId
          ? order.filter((id) => sess.get(id)?.cwd === apId)
          : order
        const index = parseInt(e.key) - 1
        if (index < projectSessions.length) {
          setAs(projectSessions[index])
        }
      }

      // Cmd+Shift+[ / ] — switch between projects
      if (meta && e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const { projectOrder: pOrder, activeProjectId: apId, setActiveProject: setAp } = useProjectStore.getState()
        if (pOrder.length < 2) return
        const currentIdx = apId ? pOrder.indexOf(apId) : -1
        let nextIdx: number
        if (e.key === ']') {
          nextIdx = currentIdx < pOrder.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : pOrder.length - 1
        }
        const nextProject = pOrder[nextIdx]
        setAp(nextProject)
        // Switch to first session in target project
        const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
        const firstSession = order.find((id) => sess.get(id)?.cwd === nextProject)
        if (firstSession) setAs(firstSession)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNewSession, handleNewTerminal, toggleSettings])

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
        <Layout onNewSession={handleNewSession} onNewSessionInProject={handleNewSessionInProject} onNewSessionInWorktree={handleNewSessionInWorktree} onNewTerminal={handleNewTerminal} onResumeSession={handleResumeSession} />
      </div>
      <ToastContainer />
      <SettingsModal />
    </div>
  )
}

export default App
