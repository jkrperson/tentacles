import { create } from 'zustand'
import type { Session, SessionStatus } from '../types'

interface SessionState {
  sessions: Map<string, Session>
  activeSessionId: string | null
  sessionOrder: string[]

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateStatus: (id: string, status: SessionStatus, exitCode?: number | null) => void
  setHasUnread: (id: string, hasUnread: boolean) => void
  renameSession: (id: string, name: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: new Map(),
  activeSessionId: null,
  sessionOrder: [],

  addSession: (session) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(session.id, session)
      return {
        sessions,
        sessionOrder: [...state.sessionOrder, session.id],
        activeSessionId: session.id,
      }
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.delete(id)
      const sessionOrder = state.sessionOrder.filter((sid) => sid !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? sessionOrder[sessionOrder.length - 1] ?? null
          : state.activeSessionId
      return { sessions, sessionOrder, activeSessionId }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateStatus: (id, status, exitCode) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...session, status, exitCode: exitCode ?? session.exitCode })
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

  renameSession: (id, name) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...session, name })
      return { sessions }
    }),
}))
