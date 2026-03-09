import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { UpdaterStatus } from '../../../src/types'
import type { autoUpdater as AutoUpdaterType } from 'electron-updater'

interface UpdaterDeps {
  getAutoUpdater: () => typeof AutoUpdaterType | null
}

export function createUpdaterRouter(deps: UpdaterDeps) {
  return t.router({
    check: t.procedure
      .mutation(async () => {
        const au = deps.getAutoUpdater()
        if (au) await au.checkForUpdates()
      }),

    download: t.procedure
      .mutation(async () => {
        const au = deps.getAutoUpdater()
        if (au) await au.downloadUpdate()
      }),

    install: t.procedure
      .mutation(() => {
        const au = deps.getAutoUpdater()
        if (au) au.quitAndInstall()
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
