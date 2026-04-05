import { create } from 'zustand'
import { trpc } from '../trpc'
import type { GitHubUser } from '../types'

interface AuthState {
  user: GitHubUser | null
  loading: boolean
  initialized: boolean
  loginDialogOpen: boolean

  checkAuth: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  showLoginDialog: () => void
  dismissLoginDialog: () => void
  subscribeToAuthChanges: () => () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,
  loginDialogOpen: true,

  checkAuth: async () => {
    try {
      set({ loading: true })
      const user = await trpc.auth.getUser.query()
      set({ user, loading: false, initialized: true })
    } catch {
      set({ user: null, loading: false, initialized: true })
    }
  },

  login: async () => {
    try {
      set({ loading: true })
      const user = await trpc.auth.login.mutate()
      set({ user, loading: false, loginDialogOpen: false })
    } catch {
      set({ loading: false })
    }
  },

  showLoginDialog: () => set({ loginDialogOpen: true }),
  dismissLoginDialog: () => set({ loginDialogOpen: false }),

  logout: async () => {
    await trpc.auth.logout.mutate()
    set({ user: null })
  },

  subscribeToAuthChanges: () => {
    const sub = trpc.auth.onAuthChange.subscribe(undefined, {
      onData: ({ user }) => {
        set({ user, loading: false, initialized: true, ...(user ? { loginDialogOpen: false } : {}) })
      },
    })
    return () => sub.unsubscribe()
  },
}))
