import { z } from 'zod'
import { t } from '../trpc'
import type { LspManager } from '../../lspManager'

interface LspDeps {
  lspManager: LspManager
}

export function createLspRouter(deps: LspDeps) {
  return t.router({
    start: t.procedure
      .input(z.object({ languageId: z.string(), projectRoot: z.string() }))
      .mutation(async ({ input }) => {
        return deps.lspManager.start(input.languageId, input.projectRoot)
      }),

    stop: t.procedure
      .input(z.object({ languageId: z.string(), projectRoot: z.string() }))
      .mutation(({ input }) => {
        deps.lspManager.stop(input.languageId, input.projectRoot)
      }),

    status: t.procedure
      .input(z.object({ languageId: z.string(), projectRoot: z.string() }))
      .query(({ input }) => {
        return deps.lspManager.status(input.languageId, input.projectRoot)
      }),

    listAvailable: t.procedure
      .query(() => {
        return deps.lspManager.listAvailable()
      }),
  })
}
