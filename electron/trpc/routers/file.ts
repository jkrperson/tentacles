import { z } from 'zod'
import * as fs from 'node:fs'
import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { FileWatcher } from '../../fileWatcher'
import type { FileChangeEvent } from '../../../src/types'

interface FileDeps {
  fileWatcher: FileWatcher
}

export function createFileRouter(deps: FileDeps) {
  return t.router({
    readDir: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .query(({ input }) => {
        return deps.fileWatcher.readDir(input.dirPath)
      }),

    readFile: t.procedure
      .input(z.object({ filePath: z.string() }))
      .query(({ input }) => {
        return fs.readFileSync(input.filePath, 'utf-8')
      }),

    writeFile: t.procedure
      .input(z.object({ filePath: z.string(), content: z.string() }))
      .mutation(({ input }) => {
        fs.writeFileSync(input.filePath, input.content, 'utf-8')
      }),

    watch: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .mutation(async ({ input }) => {
        await deps.fileWatcher.watch(input.dirPath)
      }),

    unwatchDir: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .mutation(async ({ input }) => {
        await deps.fileWatcher.unwatchDir(input.dirPath)
      }),

    unwatch: t.procedure
      .mutation(async () => {
        await deps.fileWatcher.unwatch()
      }),

    onChanged: t.procedure.subscription(() => {
      return observable<FileChangeEvent>((emit) => {
        const handler = (data: FileChangeEvent) => emit.next(data)
        ee.on('file:changed', handler)
        return () => { ee.off('file:changed', handler) }
      })
    }),
  })
}
