import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore, sessionBelongsToProject } from './workspaceStore'
import { useUIStore } from './uiStore'
import { getErrorMessage } from '../utils/errors'
import { generateRandomName } from '../utils/randomName'
import { capture } from '../lib/posthog'
import type { Session, SessionStatus, SessionsFile, AgentType, Workspace } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Agents that start in a REPL/interactive mode (waiting for user input, not immediately working). */
const IDLE_ON_START_AGENTS = new Set(['codex', 'gemini', 'cursor', 'opencode'])

function initialStatusForAgent(agentType: string): SessionStatus {
  return IDLE_ON_START_AGENTS.has(agentType) ? 'idle' : 'running'
}

// ---------------------------------------------------------------------------
// Debounced persist
// ---------------------------------------------------------------------------

function createDebouncedPersist(ms = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: (() => void) | null = null
  return {
    trigger(fn: () => void) {
      pending = fn
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { pending = null; fn() }, ms)
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null }
      if (pending) { const fn = pending; pending = null; fn() }
    },
  }
}

const persistDebounce = createDebouncedPersist()

/** Immediately flush any pending debounced persist (e.g. before app quit). */
export const flushPersist = persistDebounce.flush

// Guard: don't auto-persist until initial load completes (avoids overwriting sessions.json with empty state)
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
// Serialization
// ---------------------------------------------------------------------------

function serializeState(state: SessionState): SessionsFile {
  const workspaceStore = useWorkspaceStore.getState()
  return {
    sessions: state.sessionOrder.map((id) => state.sessions.get(id)!).filter(Boolean),
    activeSessionId: state.activeSessionId,
    tabOrder: state.tabOrder,
    workspaces: workspaceStore.workspaceOrder.map((id) => workspaceStore.workspaces.get(id)!).filter(Boolean),
  }
}

// ---------------------------------------------------------------------------
// loadSessions helpers
// ---------------------------------------------------------------------------

/** Migrate pre-workspace session data into workspace objects. Mutates sessions in place. */
function migrateSessionsToWorkspaces(sessions: Session[]): { workspaces: Map<string, Workspace>; order: string[] } {
  const workspaces = new Map<string, Workspace>()
  const order: string[] = []

  for (const s of sessions) {
    if (s.isWorktree && s.worktreePath && s.originalRepo) {
      const wsId = `worktree:${s.worktreePath}`
      if (!workspaces.has(wsId)) {
        workspaces.set(wsId, {
          id: wsId,
          projectId: s.originalRepo,
          type: 'worktree',
          branch: s.worktreeBranch || '',
          worktreePath: s.worktreePath,
          status: 'active',
          createdAt: s.createdAt,
          name: s.worktreeBranch || 'worktree',
        })
        order.push(wsId)
      }
      const mutable = s as Session
      mutable.workspaceId = wsId
    } else {
      const mainId = `main:${s.cwd}`
      if (!workspaces.has(mainId)) {
        workspaces.set(mainId, {
          id: mainId,
          projectId: s.cwd,
          type: 'main',
          branch: '',
          worktreePath: null,
          status: 'active',
          createdAt: s.createdAt,
          name: 'main',
        })
        order.push(mainId)
      }
      const mutable = s as Session
      mutable.workspaceId = mainId
    }
    // Strip deprecated fields
    delete (s as Session).isWorktree
    delete (s as Session).worktreePath
    delete (s as Session).worktreeBranch
    delete (s as Session).originalRepo
  }

  return { workspaces, order }
}

/** Try to reattach each session to the daemon. Returns restored sessions map, order, and id remapping. */
async function reattachSessions(rawSessions: Session[]): Promise<{
  sessions: Map<string, Session>
  sessionOrder: string[]
  idMap: Map<string, string>
}> {
  const sessions = new Map<string, Session>()
  const sessionOrder: string[] = []
  const idMap = new Map<string, string>()

  for (const rawSession of rawSessions) {
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
        const restored: Session = {
          ...s,
          id: result.id,
          status: (result.initialStatus as SessionStatus) || 'idle',
          statusDetail: result.initialStatusDetail ?? undefined,
          hasUnread: false,
        }
        sessions.set(restored.id, restored)
        sessionOrder.push(restored.id)
        idMap.set(s.id, restored.id)
        continue
      }
    } catch (err) {
      console.warn(`[sessionStore] Reattach failed for session ${s.id}:`, err)
    }

    // Daemon session no longer exists — restore in completed state for scrollback access
    const completed: Session = {
      ...s,
      status: 'completed' as SessionStatus,
      exitCode: s.exitCode ?? 0,
      hasUnread: false,
    }
    sessions.set(completed.id, completed)
    sessionOrder.push(completed.id)
    idMap.set(s.id, completed.id)
  }

  return { sessions, sessionOrder, idMap }
}

/** Remap saved tabOrder and activeSessionId using the id map from reattach. */
function restoreTabsAndActive(
  data: SessionsFile,
  sessionOrder: string[],
  idMap: Map<string, string>,
): { tabOrder: string[]; activeSessionId: string | null } {
  const restoredIds = new Set(sessionOrder)
  const savedTabOrder = data.tabOrder ?? []

  const tabOrder = savedTabOrder
    .map((oldId) => idMap.get(oldId) ?? oldId)
    .filter((id) => restoredIds.has(id))
  for (const id of sessionOrder) {
    if (!tabOrder.includes(id)) tabOrder.push(id)
  }

  const remappedActiveId = data.activeSessionId
    ? (idMap.get(data.activeSessionId) ?? data.activeSessionId)
    : null
  const activeSessionId = remappedActiveId && restoredIds.has(remappedActiveId)
    ? remappedActiveId
    : sessionOrder[0] ?? null

  return { tabOrder, activeSessionId }
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
      const { id, pid, hookId } = await trpc.session.create.mutate({ name: sessionName, cwd, agentType: resolvedAgent })
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
      const data = await trpc.app.loadSessions.query() as SessionsFile
      const wsStore = useWorkspaceStore.getState()
      const needsMigration = !data.workspaces || data.workspaces.length === 0

      // 1. Hydrate workspaces
      if (!needsMigration) {
        wsStore.loadWorkspaces(data.workspaces!)
      } else {
        const migrated = migrateSessionsToWorkspaces(data.sessions)
        wsStore.setWorkspaces(migrated.workspaces, migrated.order)
      }

      // 2. Reattach sessions to daemon
      const { sessions, sessionOrder, idMap } = await reattachSessions(data.sessions)

      // 3. Restore tab order and active session
      const { tabOrder, activeSessionId } = restoreTabsAndActive(data, sessionOrder, idMap)

      set({ sessions, sessionOrder, tabOrder, activeSessionId })

      // 4. Sync activeWorkspaceId in uiStore so sidebar shows correct workspace
      const activeSession = activeSessionId ? sessions.get(activeSessionId) : null
      if (activeSession?.workspaceId) {
        useUIStore.getState().setActiveWorkspaceId(activeSession.workspaceId)
      }

      // Mark store as ready so the auto-persist subscriber starts writing
      storeReady = true

      // Persist immediately if we migrated (to save workspace data)
      if (needsMigration) {
        flushPersist()
      }
    } catch (err) {
      console.error('[sessionStore] Failed to load saved sessions:', err)
    }
  },
}))

// ---------------------------------------------------------------------------
// Auto-persist: subscribe to state changes instead of manual persist() calls
// ---------------------------------------------------------------------------

function writeSessions() {
  const data = serializeState(useSessionStore.getState())
  trpc.app.saveSessions.mutate(data as unknown as Record<string, unknown>).catch((err) => {
    console.error('[sessionStore] Failed to persist sessions:', err)
  })
}

/** Cancel any pending debounce, snapshot current state, and await the write.
 *  Used by the quit-flush handshake so main knows the file is on disk. */
export async function persistNow(): Promise<void> {
  if (!storeReady) return
  persistDebounce.flush()
  const data = serializeState(useSessionStore.getState())
  try {
    await trpc.app.saveSessions.mutate(data as unknown as Record<string, unknown>)
  } catch (err) {
    console.error('[sessionStore] persistNow failed:', err)
  }
}

useSessionStore.subscribe((state, prevState) => {
  if (!storeReady) return

  // Structural changes (add/remove session, tab open/close, active switch) must
  // persist immediately — losing a write here means the next launch can't reattach.
  const structural =
    state.sessionOrder !== prevState.sessionOrder ||
    state.tabOrder !== prevState.tabOrder ||
    state.activeSessionId !== prevState.activeSessionId

  if (structural) {
    persistDebounce.flush()
    writeSessions()
    return
  }

  // Cosmetic per-session updates (status, hasUnread, statusDetail) can debounce.
  if (state.sessions !== prevState.sessions) {
    persistDebounce.trigger(writeSessions)
  }
})
