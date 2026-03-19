import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { GitHubUser } from '../../../src/types'
import type { AuthManager } from '../../authManager'

interface AuthDeps {
  authManager: AuthManager
}

export function createAuthRouter(deps: AuthDeps) {
  return t.router({
    getUser: t.procedure
      .query(async (): Promise<GitHubUser | null> => {
        // First try the in-memory user, then try restoring from storage
        const user = deps.authManager.getUser()
        if (user) return user
        return deps.authManager.getStoredAuth()
      }),

    login: t.procedure
      .mutation(async (): Promise<GitHubUser> => {
        return deps.authManager.startLogin()
      }),

    logout: t.procedure
      .mutation(async () => {
        await deps.authManager.logout()
      }),

    onAuthChange: t.procedure.subscription(() => {
      return observable<{ user: GitHubUser | null }>((emit) => {
        const handler = (data: { user: GitHubUser | null }) => emit.next(data)
        ee.on('auth:changed', handler)
        return () => { ee.off('auth:changed', handler) }
      })
    }),
  })
}
