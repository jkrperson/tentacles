import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { PtyManager } from '../../ptyManager'

interface TerminalDeps {
  ptyManager: PtyManager
}

export function createTerminalRouter(deps: TerminalDeps) {
  return t.router({
    create: t.procedure
      .input(z.object({ name: z.string(), cwd: z.string() }))
      .mutation(({ input }) => {
        return deps.ptyManager.createShell(input.name, input.cwd)
      }),

    write: t.procedure
      .input(z.object({ id: z.string(), data: z.string() }))
      .mutation(({ input }) => {
        deps.ptyManager.write(input.id, input.data)
      }),

    resize: t.procedure
      .input(z.object({ id: z.string(), cols: z.number(), rows: z.number() }))
      .mutation(({ input }) => {
        deps.ptyManager.resize(input.id, input.cols, input.rows)
      }),

    kill: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        deps.ptyManager.kill(input.id)
      }),

    onData: t.procedure.subscription(() => {
      return observable<{ id: string; data: string }>((emit) => {
        const handler = (data: { id: string; data: string }) => emit.next(data)
        ee.on('terminal:data', handler)
        return () => { ee.off('terminal:data', handler) }
      })
    }),

    onExit: t.procedure.subscription(() => {
      return observable<{ id: string; exitCode: number }>((emit) => {
        const handler = (data: { id: string; exitCode: number }) => emit.next(data)
        ee.on('terminal:exit', handler)
        return () => { ee.off('terminal:exit', handler) }
      })
    }),
  })
}
