import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore, sessionBelongsToProject } from './workspaceStore'
import { getErrorMessage } from '../utils/errors'
import { generateRandomName } from '../utils/randomName'
import { capture } from '../lib/posthog'
import type { Session, SessionStatus, SessionsFile, AgentType, Workspace } from '../types'

/** Agents that start in a REPL/interactive mode (waiting for user input, not immediately working). */
const IDLE_ON_START_AGENTS = new Set(['codex', 'gemini', 'cursor', 'opencode'])

function initialStatusForAgent(agentType: string): SessionStatus {
  return IDLE_ON_START_AGENTS.has(agentType) ? 'idle' : 'running'
}

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
  const workspaces = useWorkspaceStore.getState().workspaces
  // Extract indices of IDs belonging to this project
  const projectIndices: number[] = []
  for (let i = 0; i < order.length; i++) {
    const s = sessions.get(order[i])
    if (s && sessionBelongsToProject(s.workspaceId, projectPath, workspaces)) {
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
  closeTab: (id: string) => void
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

  // Session creation actions
  createSession: (agentType?: AgentType) => Promise<void>
  createSessionInProject: (projectPath: string, agentType?: AgentType) => Promise<void>
  createSessionInWorkspace: (workspaceId: string, name?: string, agentType?: AgentType) => Promise<void>
}

function serializeState(state: SessionState): SessionsFile {
  const workspaceStore = useWorkspaceStore.getState()
  return {
    sessions: state.sessionOrder.map((id) => state.sessions.get(id)!).filter(Boolean),
    activeSessionId: state.activeSessionId,
    tabOrder: state.tabOrder,
    workspaces: workspaceStore.workspaceOrder.map((id) => workspaceStore.workspaces.get(id)!).filter(Boolean),
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

        capture('session_killed', { agent_type: session.agentType })

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

    closeTab: (id) =>
      set((state) => {
        if (!state.tabOrder.includes(id)) return state
        const tabOrder = state.tabOrder.filter((sid) => sid !== id)
        const activeSessionId =
          state.activeSessionId === id
            ? tabOrder[tabOrder.length - 1] ?? null
            : state.activeSessionId
        persist()
        return { tabOrder, activeSessionId }
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

    setActiveSession: (id) =>
      set((state) => {
        if (!id) return { activeSessionId: id }
        const tabOrder = state.tabOrder.includes(id)
          ? state.tabOrder
          : [...state.tabOrder, id]
        return { activeSessionId: id, tabOrder }
      }),

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
      const { ensureMainWorkspace } = useWorkspaceStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

      let cwd = activeProjectId
      if (!cwd) {
        const dir = await trpc.dialog.selectDirectory.query()
        if (!dir) return
        addProject(dir)
        cwd = dir
      }

      const workspace = ensureMainWorkspace(cwd)
      const resolvedAgent = agentType ?? settings.defaultAgent
      const name = generateRandomName()
      try {
        const { id, pid, hookId } = await trpc.session.create.mutate({ name, cwd, agentType: resolvedAgent })
        get().addSession({
          id, name, cwd, status: initialStatusForAgent(resolvedAgent), createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
          workspaceId: workspace.id,
        })
        addProject(cwd)
        capture('session_created', { agent_type: resolvedAgent })
      } catch (err: unknown) {
        console.error('Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInProject: async (projectPath: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const { setActiveProject } = useProjectStore.getState()
      const { ensureMainWorkspace } = useWorkspaceStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

      const workspace = ensureMainWorkspace(projectPath)
      const resolvedAgent = agentType ?? settings.defaultAgent
      const name = generateRandomName()
      try {
        const { id, pid, hookId } = await trpc.session.create.mutate({ name, cwd: projectPath, agentType: resolvedAgent })
        get().addSession({
          id, name, cwd: projectPath, status: initialStatusForAgent(resolvedAgent), createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
          workspaceId: workspace.id,
        })
        setActiveProject(projectPath)
        capture('session_created', { agent_type: resolvedAgent })
      } catch (err: unknown) {
        console.error('Failed to spawn agent', getErrorMessage(err))
      }
    },

    createSessionInWorkspace: async (workspaceId: string, name?: string, agentType?: AgentType) => {
      const { sessionOrder } = get()
      const settings = useSettingsStore.getState().settings
      const { setActiveProject } = useProjectStore.getState()
      const wsStore = useWorkspaceStore.getState()

      if (sessionOrder.length >= settings.maxSessions) return

      const workspace = wsStore.workspaces.get(workspaceId)
      if (!workspace) return

      const cwd = workspace.worktreePath ?? workspace.projectId
      const resolvedAgent = agentType ?? settings.defaultAgent
      const sessionName = name || generateRandomName()
      try {
        const { id, pid, hookId } = await trpc.session.create.mutate({ name: sessionName, cwd, agentType: resolvedAgent })
        get().addSession({
          id, name: sessionName, cwd, status: initialStatusForAgent(resolvedAgent), createdAt: Date.now(),
          hasUnread: false, agentType: resolvedAgent, pid, hookId,
          workspaceId,
        })
        setActiveProject(workspace.projectId)
        capture('session_created', { agent_type: resolvedAgent })
      } catch (err: unknown) {
        console.error('Failed to spawn agent', getErrorMessage(err))
      }
    },

    loadSessions: async () => {
      try {
        const data = await trpc.app.loadSessions.query() as SessionsFile
        const wsStore = useWorkspaceStore.getState()

        // Phase 3: Migration — hydrate workspaces
        if (data.workspaces && data.workspaces.length > 0) {
          // Already migrated — load workspaces directly
          wsStore.loadWorkspaces(data.workspaces)
        } else {
          // Pre-migration: synthesize workspaces from session data
          const migratedWorkspaces = new Map<string, Workspace>()
          const migratedOrder: string[] = []

          for (const s of data.sessions) {
            if (s.isWorktree && s.worktreePath && s.originalRepo) {
              const wsId = `worktree:${s.worktreePath}`
              if (!migratedWorkspaces.has(wsId)) {
                migratedWorkspaces.set(wsId, {
                  id: wsId,
                  projectId: s.originalRepo,
                  type: 'worktree',
                  branch: s.worktreeBranch || '',
                  worktreePath: s.worktreePath,
                  status: 'active',
                  createdAt: s.createdAt,
                  name: s.worktreeBranch || 'worktree',
                })
                migratedOrder.push(wsId)
              }
              const mutableSession = s as Session
              mutableSession.workspaceId = wsId
            } else {
              const projectId = s.cwd
              const mainId = `main:${projectId}`
              if (!migratedWorkspaces.has(mainId)) {
                migratedWorkspaces.set(mainId, {
                  id: mainId,
                  projectId,
                  type: 'main',
                  branch: '',
                  worktreePath: null,
                  status: 'active',
                  createdAt: s.createdAt,
                  name: 'main',
                })
                migratedOrder.push(mainId)
              }
              const mutableSession2 = s as Session
              mutableSession2.workspaceId = mainId
            }
            // Strip deprecated fields
            delete (s as Session).isWorktree
            delete (s as Session).worktreePath
            delete (s as Session).worktreeBranch
            delete (s as Session).originalRepo
          }
          wsStore.setWorkspaces(migratedWorkspaces, migratedOrder)
        }

        const sessions = new Map<string, Session>()
        const sessionOrder: string[] = []
        const savedTabOrder = data.tabOrder ?? []
        const idMap = new Map<string, string>()

        for (const rawSession of data.sessions) {
          const s = {
            ...rawSession,
            agentType: rawSession.agentType ?? 'claude' as const,
            workspaceId: rawSession.workspaceId || `main:${rawSession.cwd}`,
          }

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
        }

        // Restore tabOrder, remapping old IDs and filtering out discarded sessions
        const restoredIds = new Set(sessionOrder)
        const tabOrder = savedTabOrder
          .map((oldId) => idMap.get(oldId) ?? oldId)
          .filter((id) => restoredIds.has(id))
        for (const id of sessionOrder) {
          if (!tabOrder.includes(id)) tabOrder.push(id)
        }

        set({
          sessions,
          sessionOrder,
          tabOrder,
          activeSessionId: sessionOrder[0] ?? null,
        })

        // Persist immediately if we migrated (to save workspace data)
        if (!data.workspaces || data.workspaces.length === 0) {
          persist()
        }
      } catch {
        // No saved sessions — nothing to load
      }
    },
  }
})
