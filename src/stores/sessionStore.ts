import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore, sessionBelongsToProject } from './workspaceStore'
import { useUIStore } from './uiStore'
import { getErrorMessage } from '../utils/errors'
import { generateRandomName } from '../utils/randomName'
import { capture } from '../lib/posthog'
import type { Session, SessionStatus, AgentType } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Agents that start in a REPL/interactive mode (waiting for user input, not immediately working). */
const IDLE_ON_START_AGENTS = new Set(['codex', 'gemini', 'cursor', 'opencode'])

function initialStatusForAgent(agentType: string): SessionStatus {
  return IDLE_ON_START_AGENTS.has(agentType) ? 'idle' : 'running'
}

// Guard: don't auto-persist until initial load completes (avoids overwriting prefs with empty state)
let storeReady = false

// ---------------------------------------------------------------------------
// Reorder helper
// ---------------------------------------------------------------------------

/** Reorder an item within a project-scoped subset of a full order array. */
function reorderWithinProject(
  order: string[],
  fromIndex: number,
  toIndex: number,
  projectPath: string,
  sessions: Map<string, Session>,
): string[] {
  const workspaces = useWorkspaceStore.getState().workspaces
  const projectIndices: number[] = []
  for (let i = 0; i < order.length; i++) {
    const s = sessions.get(order[i])
    if (s && sessionBelongsToProject(s.workspaceId, projectPath, workspaces)) {
      projectIndices.push(i)
    }
  }
  if (fromIndex < 0 || fromIndex >= projectIndices.length || toIndex < 0 || toIndex >= projectIndices.length) return order
  if (fromIndex === toIndex) return order

  const projectIds = projectIndices.map((i) => order[i])
  const [moved] = projectIds.splice(fromIndex, 1)
  projectIds.splice(toIndex, 0, moved)

  const next = [...order]
  for (let i = 0; i < projectIndices.length; i++) {
    next[projectIndices[i]] = projectIds[i]
  }
  return next
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface CreateSessionOpts {
  workspaceId?: string
  projectPath?: string
  name?: string
  agentType?: AgentType
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
  refreshFromDaemon: () => Promise<void>

  // Session creation
  createSession: (opts?: CreateSessionOpts) => Promise<void>
  /** @deprecated Use createSession({ projectPath }) */
  createSessionInProject: (projectPath: string, agentType?: AgentType) => Promise<void>
  /** @deprecated Use createSession({ workspaceId }) */
  createSessionInWorkspace: (workspaceId: string, name?: string, agentType?: AgentType) => Promise<void>
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  sessionOrder: [],
  tabOrder: [],

  addSession: (session) => {
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(session.id, session)
      return {
        sessions,
        sessionOrder: [...state.sessionOrder, session.id],
        tabOrder: [...state.tabOrder, session.id],
        activeSessionId: session.id,
      }
    })
    // Keep activeWorkspaceId in sync so file tree/git panels update
    useUIStore.getState().setActiveWorkspaceId(session.workspaceId)
  },

  removeSession: (id) => {
    const session = useSessionStore.getState().sessions.get(id)
    if (!session) return
    capture('session_killed', { agent_type: session.agentType })
    trpc.session.kill.mutate({ id }).catch((err) =>
      console.error('[sessionStore] kill failed:', err))
    // Optimistic tab close so the user gets immediate feedback;
    // the actual session-list update arrives via the listChanged subscription.
    set((state) => ({
      tabOrder: state.tabOrder.filter((sid) => sid !== id),
      activeSessionId: state.activeSessionId === id
        ? state.tabOrder.filter((sid) => sid !== id).slice(-1)[0] ?? null
        : state.activeSessionId,
    }))
  },

  closeTab: (id) =>
    set((state) => {
      if (!state.tabOrder.includes(id)) return state
      const tabOrder = state.tabOrder.filter((sid) => sid !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? tabOrder[tabOrder.length - 1] ?? null
          : state.activeSessionId
      return { tabOrder, activeSessionId }
    }),

  reorderSessions: (fromIndex, toIndex, projectPath) =>
    set((state) => ({
      sessionOrder: reorderWithinProject(state.sessionOrder, fromIndex, toIndex, projectPath, state.sessions),
    })),

  reorderTabs: (fromIndex, toIndex, projectPath) =>
    set((state) => ({
      tabOrder: reorderWithinProject(state.tabOrder, fromIndex, toIndex, projectPath, state.sessions),
    })),

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
      return { sessions }
    }),

  renameSession: (id, name) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...session, name })
      return { sessions }
    }),

  // -----------------------------------------------------------------------
  // Session creation (unified)
  // -----------------------------------------------------------------------

  createSession: async (opts: CreateSessionOpts = {}) => {
    const { sessionOrder } = get()
    const settings = useSettingsStore.getState().settings
    if (sessionOrder.length >= settings.maxSessions) return

    const resolvedAgent = opts.agentType ?? settings.defaultAgent

    // Resolve workspace + cwd
    let workspace
    let cwd: string

    if (opts.workspaceId) {
      workspace = useWorkspaceStore.getState().workspaces.get(opts.workspaceId)
      if (!workspace) return
      cwd = workspace.worktreePath ?? workspace.projectId
    } else {
      let projectPath = opts.projectPath ?? useProjectStore.getState().activeProjectId
      if (!projectPath) {
        const dir = await trpc.dialog.selectDirectory.query()
        if (!dir) return
        useProjectStore.getState().addProject(dir)
        projectPath = dir
      }
      workspace = useWorkspaceStore.getState().ensureMainWorkspace(projectPath)
      cwd = projectPath
    }

    const sessionName = opts.name || generateRandomName()
    try {
      const { id, pid, hookId } = await trpc.session.create.mutate({
        name: sessionName,
        cwd,
        workspaceId: workspace.id,
        agentType: resolvedAgent,
      })
      get().addSession({
        id, name: sessionName, cwd, status: initialStatusForAgent(resolvedAgent), createdAt: Date.now(),
        hasUnread: false, agentType: resolvedAgent, pid, hookId,
        workspaceId: workspace.id,
      })
      useProjectStore.getState().addProject(workspace.projectId)
      capture('session_created', { agent_type: resolvedAgent })
    } catch (err: unknown) {
      console.error('Failed to spawn agent', getErrorMessage(err))
    }
  },

  // Thin wrappers for backward compatibility — callers can migrate to createSession(opts) over time
  createSessionInProject: async (projectPath: string, agentType?: AgentType) => {
    await get().createSession({ projectPath, agentType })
  },

  createSessionInWorkspace: async (workspaceId: string, name?: string, agentType?: AgentType) => {
    await get().createSession({ workspaceId, name, agentType })
  },

  // -----------------------------------------------------------------------
  // Load sessions from disk
  // -----------------------------------------------------------------------

  loadSessions: async () => {
    try {
      const daemonSessions = await trpc.session.snapshot.query()
      const uiPrefs = await trpc.app.loadUiPrefs.query()

      const wsStore = useWorkspaceStore.getState()
      await wsStore.loadFromDaemon()

      const effectiveUiPrefs = uiPrefs

      const sessions = new Map<string, Session>()
      const sessionOrder: string[] = []
      for (const ds of daemonSessions) {
        const s: Session = {
          id: ds.id,
          name: ds.name,
          cwd: ds.cwd,
          status: ds.status,
          createdAt: ds.createdAt,
          hasUnread: effectiveUiPrefs.hasUnread?.[ds.id] ?? false,
          agentType: ds.agentType,
          workspaceId: ds.workspaceId,
          pid: ds.pid,
          exitCode: ds.exitCode ?? undefined,
          hookId: ds.hookId ?? undefined,
        }
        sessions.set(s.id, s)
        sessionOrder.push(s.id)
      }

      const tabOrder = (effectiveUiPrefs.tabOrder ?? []).filter((id: string) => sessions.has(id))
      for (const id of sessionOrder) if (!tabOrder.includes(id)) tabOrder.push(id)
      const activeSessionId = effectiveUiPrefs.activeSessionId && sessions.has(effectiveUiPrefs.activeSessionId)
        ? effectiveUiPrefs.activeSessionId
        : sessionOrder[0] ?? null

      set({ sessions, sessionOrder, tabOrder, activeSessionId })

      if (activeSessionId) {
        const active = sessions.get(activeSessionId)
        if (active?.workspaceId) useUIStore.getState().setActiveWorkspaceId(active.workspaceId)
      }

      storeReady = true
    } catch (err) {
      console.error('[sessionStore] Failed to load sessions:', err)
    }
  },

  refreshFromDaemon: async () => {
    if (!storeReady) return
    try {
      const daemonSessions = await trpc.session.snapshot.query()
      set((state) => {
        const next = new Map<string, Session>()
        for (const ds of daemonSessions) {
          const existing = state.sessions.get(ds.id)
          next.set(ds.id, {
            id: ds.id,
            name: ds.name,
            cwd: ds.cwd,
            status: ds.status,
            createdAt: ds.createdAt,
            agentType: ds.agentType,
            workspaceId: ds.workspaceId,
            pid: ds.pid,
            exitCode: ds.exitCode ?? undefined,
            hookId: ds.hookId ?? undefined,
            hasUnread: existing?.hasUnread ?? false,
            statusDetail: existing?.statusDetail,
          })
        }
        const sessionOrder = daemonSessions.map((s) => s.id)
        const tabOrder = state.tabOrder.filter((id) => next.has(id))
        const activeSessionId = state.activeSessionId && next.has(state.activeSessionId)
          ? state.activeSessionId
          : sessionOrder[sessionOrder.length - 1] ?? null
        return { sessions: next, sessionOrder, tabOrder, activeSessionId }
      })
    } catch (err) {
      console.error('[sessionStore] refreshFromDaemon failed:', err)
    }
  },
}))

// ---------------------------------------------------------------------------
// Auto-persist UI prefs (tabs/active/unread) — session truth lives in the daemon
// ---------------------------------------------------------------------------

type UiPrefsShape = {
  tabOrder: string[]
  activeSessionId: string | null
  hasUnread: Record<string, boolean>
}

let lastWrittenUiPrefs: string | null = null

function snapshotUiPrefs(): UiPrefsShape {
  const state = useSessionStore.getState()
  const hasUnread: Record<string, boolean> = {}
  for (const [id, s] of state.sessions) {
    if (s.hasUnread) hasUnread[id] = true
  }
  return {
    tabOrder: state.tabOrder,
    activeSessionId: state.activeSessionId,
    hasUnread,
  }
}

function writeUiPrefs() {
  const prefs = snapshotUiPrefs()
  const serialized = JSON.stringify(prefs)
  if (serialized === lastWrittenUiPrefs) return
  lastWrittenUiPrefs = serialized
  trpc.app.saveUiPrefs.mutate(prefs).catch((err) => console.error('[sessionStore] saveUiPrefs failed:', err))
}

useSessionStore.subscribe((state, prevState) => {
  if (!storeReady) return
  if (
    state.tabOrder !== prevState.tabOrder ||
    state.activeSessionId !== prevState.activeSessionId ||
    state.sessions !== prevState.sessions
  ) {
    writeUiPrefs()
  }
})

/** Snapshot UI prefs and await the write. Used by the quit-flush handshake. */
export async function persistUiNow(): Promise<void> {
  if (!storeReady) return
  const prefs = snapshotUiPrefs()
  const serialized = JSON.stringify(prefs)
  // Skip the write if nothing relevant changed since the last persist.
  if (serialized !== lastWrittenUiPrefs) {
    lastWrittenUiPrefs = serialized
    try {
      await trpc.app.saveUiPrefs.mutate(prefs)
    } catch (err) {
      console.error('[sessionStore] persistUiNow failed:', err)
    }
  }
}
