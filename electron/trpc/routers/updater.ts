import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { UpdaterStatus } from '../../../src/types'

interface UpdaterDeps {
  checkForUpdates: () => Promise<void>
}

export function createUpdaterRouter(deps: UpdaterDeps) {
  return t.router({
    check: t.procedure
      .mutation(async () => {
        await deps.checkForUpdates()
      }),

    onStatus: t.procedure.subscription(() => {
      return observable<UpdaterStatus>((emit) => {
        const handler = (data: UpdaterStatus) => emit.next(data)
        ee.on('updater:status', handler)
        return () => { ee.off('updater:status', handler) }
      })
    }),
  })
}
