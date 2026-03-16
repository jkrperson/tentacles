import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { getErrorMessage } from '../utils/errors'
import type { Session, SessionStatus, SessionsFile, AgentType } from '../types'

// Debounce helper
let persistTimer: ReturnType<typeof setTimeout> | null = null
function debouncedPersist(fn: () => void, ms = 500) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(fn, ms)
}

/** Reorder an item within a project-scoped subset of a full order array. */
function reorderWithinProject(
  order: string[],
  fromIndex: number,
  toIndex: number,
  projectPath: string,
  sessions: Map<string, Session>,
): string[] {
  // Extract indices of IDs belonging to this project
  const projectIndices: number[] = []
  for (let i = 0; i < order.length; i++) {
    const s = sessions.get(order[i])
    if (s && (s.cwd === projectPath || s.originalRepo === projectPath)) {
      projectIndices.push(i)
    }
  }
  if (fromIndex < 0 || fromIndex >= projectIndices.length || toIndex < 0 || toIndex >= projectIndices.length) return order
  if (fromIndex === toIndex) return order

  // Get the project-scoped IDs in order
  const projectIds = projectIndices.map((i) => order[i])
  // Perform the move within the subset
  const [moved] = projectIds.splice(fromIndex, 1)
  projectIds.splice(toIndex, 0, moved)

  // Splice reordered subset back into full array
  const next = [...order]
  for (let i = 0; i < projectIndices.length; i++) {
    next[projectIndices[i]] = projectIds[i]
  }
  return next
}

interface SessionState {
  sessions: Map<string, Session>
  activeSessionId: string | null
  sessionOrder: string[]
  tabOrder: string[]

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateStatus: (id: string, status: SessionStatus, exitCode?: number | null) => void
  setStatusDetail: (id: string, detail: string | null) => void
  setHasUnread: (id: string, hasUnread: boolean) => void
  acknowledgeSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  reorderSessions: (fromIndex: number, toIndex: number, projectPath: string) => void
  reorderTabs: (fromIndex: number, toIndex: number, projectPath: string) => void
  loadSessions: () => Promise<void>
  persistSessions: () => void

  // Session creation actions (moved from App.tsx)
  createSession: (agentType?: AgentType) => Promise<void>
  createSessionInProject: (projectPath: string, agentType?: AgentType) => Promise<void>
  createSessionInWorktree: (projectPath: string, name?: string, agentType?: AgentType) => Promise<void>
}

function serializeState(state: SessionState): SessionsFile {
  return {
    sessions: state.sessionOrder.map((id) => state.sessions.get(id)!).filter(Boolean),
    activeSessionId: state.activeSessionId,
    tabOrder: state.tabOrder,
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
    tabOrder: [],

    persistSessions: persist,

    addSession: (session) =>
      set((state) => {
        const sessions = new Map(state.sessions)
        sessions.set(session.id, session)
        const next = {
          sessions,
          sessionOrder: [...state.sessionOrder, session.id],
          tabOrder: [...state.tabOrder, session.id],
          activeSessionId: session.id,
        }
        persist()
        return next
      }),

    removeSession: (id) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state

        const sessions = new Map(state.sessions)
        sessions.delete(id)
        const sessionOrder = state.sessionOrder.filter((sid) => sid !== id)
        const tabOrder = state.tabOrder.filter((sid) => sid !== id)
        const activeSessionId =
          state.activeSessionId === id
            ? sessionOrder[sessionOrder.length - 1] ?? null
            : state.activeSessionId

        persist()
        return { sessions, sessionOrder, tabOrder, activeSessionId }
      }),

    reorderSessions: (fromIndex, toIndex, projectPath) =>
      set((state) => {
        const sessionOrder = reorderWithinProject(state.sessionOrder, fromIndex, toIndex, projectPath, state.sessions)
        persist()
        return { sessionOrder }
      }),

    reorderTabs: (fromIndex, toIndex, projectPath) =>
      set((state) => {
        const tabOrder = reorderWithinProject(state.tabOrder, fromIndex, toIndex, projectPath, state.sessions)
        persist()
        return { tabOrder }
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
        const updates: Partial<Session> = {}
        if (session.hasUnread) updates.hasUnread = false
        // Only transition completed→idle when the process is still alive (no exit code)
        // Never touch needs_input or running — those are live statuses
        if (session.status === 'completed' && session.exitCode == null) {
          updates.status = 'idle'
        }
        if (Object.keys(updates).length === 0) return state
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, ...updates })
        persist()
        return { sessions }
      }),

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
      const { activeProjectId, addProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

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
        console.error('Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInProject: async (projectPath: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const { setActiveProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

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
        console.error('Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInWorktree: async (projectPath: string, worktreeName?: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const { setActiveProject } = useProjectStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

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
        console.error('Failed to create worktree', getErrorMessage(err))
      }
    },

    loadSessions: async () => {
      try {
        const data = await trpc.app.loadSessions.query() as SessionsFile

        const sessions = new Map<string, Session>()
        const sessionOrder: string[] = []
        const savedTabOrder = data.tabOrder ?? []
        // Track which old IDs mapped to which new IDs (reattach may change IDs)
        const idMap = new Map<string, string>()

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

              const restored: Session = {
                ...s,
                id: result.id,
                status: initialStatus,
                statusDetail: result.initialStatusDetail ?? undefined,
                hasUnread: false,
              }
              sessions.set(restored.id, restored)
              sessionOrder.push(restored.id)
              idMap.set(s.id, restored.id)
              continue
            }
          } catch { /* reattach failed — daemon session not found */ }

          // Session couldn't be reattached — discard it
        }

        // Restore tabOrder, remapping old IDs and filtering out discarded sessions
        const restoredIds = new Set(sessionOrder)
        const tabOrder = savedTabOrder
          .map((oldId) => idMap.get(oldId) ?? oldId)
          .filter((id) => restoredIds.has(id))
        // Append any restored sessions missing from saved tabOrder
        for (const id of sessionOrder) {
          if (!tabOrder.includes(id)) tabOrder.push(id)
        }

        set({
          sessions,
          sessionOrder,
          tabOrder,
          activeSessionId: sessionOrder[0] ?? null,
        })
      } catch {
        // No saved sessions — nothing to load
      }
    },
  }
})
