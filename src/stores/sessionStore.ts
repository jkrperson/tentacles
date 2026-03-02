import { create } from 'zustand'
import type { Session, SessionStatus, SessionsFile } from '../types'

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
  setClaudeSessionId: (id: string, claudeSessionId: string) => void
  restoreSession: (id: string) => Session | null
  renameSession: (id: string, name: string) => void
  loadSessions: () => Promise<void>
  persistSessions: () => void
}

function serializeState(state: SessionState): SessionsFile {
  return {
    sessions: state.sessionOrder.map((id) => state.sessions.get(id)!).filter(Boolean),
    archived: state.archivedOrder.map((id) => state.archivedSessions.get(id)!).filter(Boolean),
    activeSessionId: state.activeSessionId,
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  sessionOrder: [],
  archivedSessions: new Map(),
  archivedOrder: [],

  persistSessions: () => {
    debouncedPersist(() => {
      const data = serializeState(get())
      window.electronAPI.app.saveSessions(data).catch(() => {})
    })
  },

  addSession: (session) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(session.id, session)
      const next = {
        sessions,
        sessionOrder: [...state.sessionOrder, session.id],
        activeSessionId: session.id,
      }
      // Persist after state update
      debouncedPersist(() => {
        const data = serializeState(get())
        window.electronAPI.app.saveSessions(data).catch(() => {})
      })
      return next
    }),

  removeSession: (id) => {
    // Archive instead of deleting
    get().archiveSession(id)
  },

  archiveSession: (id) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state

      // Remove from active
      const sessions = new Map(state.sessions)
      sessions.delete(id)
      const sessionOrder = state.sessionOrder.filter((sid) => sid !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? sessionOrder[sessionOrder.length - 1] ?? null
          : state.activeSessionId

      // Add to archived
      const archivedSessions = new Map(state.archivedSessions)
      const archivedSession = { ...session, archivedAt: Date.now(), hasUnread: false }
      archivedSessions.set(id, archivedSession)
      const archivedOrder = [id, ...state.archivedOrder]

      debouncedPersist(() => {
        const data = serializeState(get())
        window.electronAPI.app.saveSessions(data).catch(() => {})
      })

      return { sessions, sessionOrder, activeSessionId, archivedSessions, archivedOrder }
    }),

  deleteArchivedSession: (id) =>
    set((state) => {
      const archivedSessions = new Map(state.archivedSessions)
      archivedSessions.delete(id)
      const archivedOrder = state.archivedOrder.filter((sid) => sid !== id)

      debouncedPersist(() => {
        const data = serializeState(get())
        window.electronAPI.app.saveSessions(data).catch(() => {})
      })

      return { archivedSessions, archivedOrder }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateStatus: (id, status, exitCode) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...session, status, exitCode: exitCode ?? session.exitCode })

      debouncedPersist(() => {
        const data = serializeState(get())
        window.electronAPI.app.saveSessions(data).catch(() => {})
      })

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

  setClaudeSessionId: (id, claudeSessionId) =>
    set((state) => {
      // Check active sessions first
      const session = state.sessions.get(id)
      if (session) {
        const sessions = new Map(state.sessions)
        sessions.set(id, { ...session, claudeSessionId })
        debouncedPersist(() => {
          const data = serializeState(get())
          window.electronAPI.app.saveSessions(data).catch(() => {})
        })
        return { sessions }
      }
      // Check archived sessions
      const archived = state.archivedSessions.get(id)
      if (archived) {
        const archivedSessions = new Map(state.archivedSessions)
        archivedSessions.set(id, { ...archived, claudeSessionId })
        debouncedPersist(() => {
          const data = serializeState(get())
          window.electronAPI.app.saveSessions(data).catch(() => {})
        })
        return { archivedSessions }
      }
      return state
    }),

  restoreSession: (id) => {
    const state = get()
    const session = state.archivedSessions.get(id)
    if (!session) return null

    // Remove from archived
    const archivedSessions = new Map(state.archivedSessions)
    archivedSessions.delete(id)
    const archivedOrder = state.archivedOrder.filter((sid) => sid !== id)

    set({ archivedSessions, archivedOrder })

    debouncedPersist(() => {
      const data = serializeState(get())
      window.electronAPI.app.saveSessions(data).catch(() => {})
    })

    return session
  },

  renameSession: (id, name) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...session, name })

      debouncedPersist(() => {
        const data = serializeState(get())
        window.electronAPI.app.saveSessions(data).catch(() => {})
      })

      return { sessions }
    }),

  loadSessions: async () => {
    try {
      const data: SessionsFile = await window.electronAPI.app.loadSessions()

      const sessions = new Map<string, Session>()
      const sessionOrder: string[] = []
      const archivedSessions = new Map<string, Session>()
      const archivedOrder: string[] = []

      // Try to reattach tmux-backed sessions; archive the rest
      for (const rawSession of data.sessions) {
        // Migration: ensure agentType exists for sessions saved before multi-agent support
        const s = { ...rawSession, agentType: rawSession.agentType ?? 'claude' as const }
        if (s.tmuxSessionName) {
          try {
            const result = await window.electronAPI.session.reattach(
              s.tmuxSessionName,
              s.hookId || '',
              s.name,
              s.cwd,
            )
            if (result) {
              // Determine initial status from pane title (✳ prefix = idle, Claude Code only)
              const isIdle = s.agentType === 'claude' && result.paneTitle
                ? (result.paneTitle.codePointAt(0) === 0x2733)
                : false
              const initialStatus: SessionStatus = isIdle ? 'idle' : 'running'

              // Use recoveredClaudeSessionId as fallback if we didn't persist one
              const claudeSessionId = s.claudeSessionId || result.recoveredClaudeSessionId

              const restored: Session = {
                ...s,
                id: result.id,
                pid: result.pid,
                status: initialStatus,
                statusDetail: result.initialStatusDetail ?? undefined,
                claudeSessionId,
                hasUnread: false,
              }
              sessions.set(restored.id, restored)
              sessionOrder.push(restored.id)
              continue
            }
          } catch { /* reattach failed */ }
        }

        // Archive if not reattachable
        const archived: Session = {
          ...s,
          status: s.status === 'running' || s.status === 'idle' ? 'completed' : s.status,
          archivedAt: s.archivedAt ?? Date.now(),
          hasUnread: false,
        }
        archivedSessions.set(s.id, archived)
        archivedOrder.push(s.id)
      }

      // Load previously archived sessions
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
}))
