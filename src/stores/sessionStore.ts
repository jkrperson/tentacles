import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { useNotificationStore } from './notificationStore'
import { getErrorMessage } from '../utils/errors'
import type { Session, SessionStatus, SessionsFile, AgentType } from '../types'

// Debounce helper
let persistTimer: ReturnType<typeof setTimeout> | null = null
function debouncedPersist(fn: () => void, ms = 500) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(fn, ms)
}

interface SessionState {
  sessions: Map<string, Session>
  activeSessionId: string | null
  sessionOrder: string[]

  archivedSessions: Map<string, Session>
  archivedOrder: string[]

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  archiveSession: (id: string) => void
  deleteArchivedSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateStatus: (id: string, status: SessionStatus, exitCode?: number | null) => void
  setStatusDetail: (id: string, detail: string | null) => void
  setHasUnread: (id: string, hasUnread: boolean) => void
  acknowledgeSession: (id: string) => void
  setClaudeSessionId: (id: string, claudeSessionId: string) => void
  restoreSession: (id: string) => Session | null
  renameSession: (id: string, name: string) => void
  loadSessions: () => Promise<void>
  persistSessions: () => void

  // Session creation actions (moved from App.tsx)
  createSession: (agentType?: AgentType) => Promise<void>
  createSessionInProject: (projectPath: string, agentType?: AgentType) => Promise<void>
  createSessionInWorktree: (projectPath: string, name?: string, agentType?: AgentType) => Promise<void>
  resumeSession: (archivedSessionId: string) => Promise<void>
}

function serializeState(state: SessionState): SessionsFile {
  return {
    sessions: state.sessionOrder.map((id) => state.sessions.get(id)!).filter(Boolean),
    archived: state.archivedOrder.map((id) => state.archivedSessions.get(id)!).filter(Boolean),
    activeSessionId: state.activeSessionId,
  }
}

export const useSessionStore = create<SessionState>((set, get) => {
  // Single persist closure — captures `get` once
  const persist = () => {
    debouncedPersist(() => {
      const data = serializeState(get())
      trpc.app.saveSessions.mutate(data as unknown as Record<string, unknown>).catch(() => {})
    })
  }

  return {
    sessions: new Map(),
    activeSessionId: null,
    sessionOrder: [],
    archivedSessions: new Map(),
    archivedOrder: [],

    persistSessions: persist,

    addSession: (session) =>
      set((state) => {
        const sessions = new Map(state.sessions)
        sessions.set(session.id, session)
        const next = {
          sessions,
          sessionOrder: [...state.sessionOrder, session.id],
          activeSessionId: session.id,
        }
        persist()
        return next
      }),

    removeSession: (id) => {
      get().archiveSession(id)
    },

    archiveSession: (id) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state

        const sessions = new Map(state.sessions)
        sessions.delete(id)
        const sessionOrder = state.sessionOrder.filter((sid) => sid !== id)
        const activeSessionId =
          state.activeSessionId === id
            ? sessionOrder[sessionOrder.length - 1] ?? null
            : state.activeSessionId

        const archivedSessions = new Map(state.archivedSessions)
        const archivedSession = { ...session, archivedAt: Date.now(), hasUnread: false }
        archivedSessions.set(id, archivedSession)
        const archivedOrder = [id, ...state.archivedOrder]

        persist()
        return { sessions, sessionOrder, activeSessionId, archivedSessions, archivedOrder }
      }),

    deleteArchivedSession: (id) =>
      set((state) => {
        const archivedSessions = new Map(state.archivedSessions)
        archivedSessions.delete(id)
        const archivedOrder = state.archivedOrder.filter((sid) => sid !== id)
        persist()
        return { archivedSessions, archivedOrder }
      }),

    setActiveSession: (id) => set({ activeSessionId: id }),

    updateStatus: (id, status, exitCode) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, status, exitCode: exitCode ?? session.exitCode })
        persist()
        return { sessions }
      }),

    setStatusDetail: (id, detail) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const normalized = detail ?? undefined
        if (session.statusDetail === normalized) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, statusDetail: normalized })
        return { sessions }
      }),

    setHasUnread: (id, hasUnread) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session || session.hasUnread === hasUnread) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, hasUnread })
        return { sessions }
      }),

    acknowledgeSession: (id) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const updates: Partial<Session> = { hasUnread: false }
        if (session.status === 'completed' && session.exitCode == null) {
          updates.status = 'idle'
        }
        if (!updates.status && !session.hasUnread) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, ...updates })
        persist()
        return { sessions }
      }),

    setClaudeSessionId: (id, claudeSessionId) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (session) {
          const sessions = new Map(state.sessions)
          sessions.set(id, { ...session, claudeSessionId })
          persist()
          return { sessions }
        }
        const archived = state.archivedSessions.get(id)
        if (archived) {
          const archivedSessions = new Map(state.archivedSessions)
          archivedSessions.set(id, { ...archived, claudeSessionId })
          persist()
          return { archivedSessions }
        }
        return state
      }),

    restoreSession: (id) => {
      const state = get()
      const session = state.archivedSessions.get(id)
      if (!session) return null

      const archivedSessions = new Map(state.archivedSessions)
      archivedSessions.delete(id)
      const archivedOrder = state.archivedOrder.filter((sid) => sid !== id)

      set({ archivedSessions, archivedOrder })
      persist()
      return session
    },

    renameSession: (id, name) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, name })
        persist()
        return { sessions }
      }),

    createSession: async (agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const notify = useNotificationStore.getState().notify
      const { activeProjectId, addProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) {
        notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
        return
      }

      let cwd = activeProjectId
      if (!cwd) {
        const dir = await trpc.dialog.selectDirectory.query()
        if (!dir) return
        addProject(dir)
        cwd = dir
      }

      const resolvedAgent = agentType ?? settings.defaultAgent
      const name = `Agent ${sessionOrder.length + 1}`
      try {
        const { id, pid, hookId } = await trpc.session.create.mutate({ name, cwd, agentType: resolvedAgent })
        get().addSession({
          id, name, cwd, status: 'running', createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
        })
        addProject(cwd)
      } catch (err: unknown) {
        notify('error', 'Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInProject: async (projectPath: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const notify = useNotificationStore.getState().notify
      const { setActiveProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) {
        notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
        return
      }

      const resolvedAgent = agentType ?? settings.defaultAgent
      const name = `Agent ${sessionOrder.length + 1}`
      try {
        const { id, pid, hookId } = await trpc.session.create.mutate({ name, cwd: projectPath, agentType: resolvedAgent })
        get().addSession({
          id, name, cwd: projectPath, status: 'running', createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
        })
        setActiveProject(projectPath)
      } catch (err: unknown) {
        notify('error', 'Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInWorktree: async (projectPath: string, worktreeName?: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const notify = useNotificationStore.getState().notify
      const { setActiveProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) {
        notify('warning', 'Max agents reached', `Limit is ${settings.maxSessions}`)
        return
      }

      const resolvedAgent = agentType ?? settings.defaultAgent
      try {
        const { worktreePath, branch } = await trpc.git.worktree.create.mutate({ repoPath: projectPath, name: worktreeName })
        const name = worktreeName || `Agent ${sessionOrder.length + 1}`
        const { id, pid, hookId } = await trpc.session.create.mutate({ name, cwd: worktreePath, agentType: resolvedAgent })
        get().addSession({
          id, name, cwd: worktreePath, status: 'running', createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
          isWorktree: true, worktreePath, worktreeBranch: branch, originalRepo: projectPath,
        })
        setActiveProject(projectPath)
      } catch (err: unknown) {
        notify('error', 'Failed to create worktree', getErrorMessage(err))
      }
    },

    resumeSession: async (archivedSessionId: string) => {
      const notify = useNotificationStore.getState().notify
      const { setActiveProject } = useProjectStore.getState()
      const archived = get().restoreSession(archivedSessionId)

      if (!archived) {
        notify('error', 'Cannot resume', 'Session not found in archive')
        return
      }
      if (!archived.claudeSessionId) {
        notify('warning', 'Cannot resume', 'No session ID available for resume')
        return
      }
      try {
        const { id, pid, hookId } = await trpc.session.resume.mutate({
          claudeSessionId: archived.claudeSessionId,
          name: archived.name,
          cwd: archived.cwd,
          agentType: archived.agentType,
        })
        get().addSession({
          id, name: archived.name, cwd: archived.cwd, status: 'running',
          createdAt: Date.now(), hasUnread: false, agentType: archived.agentType,
          pid, hookId, claudeSessionId: archived.claudeSessionId,
          isWorktree: archived.isWorktree, worktreePath: archived.worktreePath,
          worktreeBranch: archived.worktreeBranch, originalRepo: archived.originalRepo,
        })
        setActiveProject(archived.originalRepo ?? archived.cwd)
      } catch (err: unknown) {
        notify('error', 'Failed to resume session', getErrorMessage(err))
      }
    },

    loadSessions: async () => {
      try {
        const data = await trpc.app.loadSessions.query() as SessionsFile

        const sessions = new Map<string, Session>()
        const sessionOrder: string[] = []
        const archivedSessions = new Map<string, Session>()
        const archivedOrder: string[] = []

        for (const rawSession of data.sessions) {
          const s = { ...rawSession, agentType: rawSession.agentType ?? 'claude' as const }

          try {
            const result = await trpc.session.reattach.mutate({
              sessionId: s.id,
              hookId: s.hookId || '',
              name: s.name,
              cwd: s.cwd,
              agentType: s.agentType,
            })
            if (result) {
              const initialStatus = (result.initialStatus as SessionStatus) || 'idle'
              const claudeSessionId = s.claudeSessionId || result.recoveredClaudeSessionId

              const restored: Session = {
                ...s,
                id: result.id,
                status: initialStatus,
                statusDetail: result.initialStatusDetail ?? undefined,
                claudeSessionId,
                hasUnread: false,
              }
              sessions.set(restored.id, restored)
              sessionOrder.push(restored.id)
              continue
            }
          } catch { /* reattach failed — daemon session not found */ }

          const archived: Session = {
            ...s,
            status: s.status === 'running' || s.status === 'idle' || s.status === 'needs_input' ? 'completed' : s.status,
            archivedAt: s.archivedAt ?? Date.now(),
            hasUnread: false,
          }
          archivedSessions.set(s.id, archived)
          archivedOrder.push(s.id)
        }

        for (const rawArchived of data.archived) {
          const s = { ...rawArchived, agentType: rawArchived.agentType ?? 'claude' as const }
          archivedSessions.set(s.id, { ...s, hasUnread: false })
          archivedOrder.push(s.id)
        }

        set({
          sessions,
          sessionOrder,
          activeSessionId: sessionOrder[0] ?? null,
          archivedSessions,
          archivedOrder,
        })
      } catch {
        // No saved sessions — nothing to load
      }
    },
  }
})
