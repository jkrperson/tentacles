import { z } from 'zod'
import { t } from '../trpc'
import { createSubscription } from '../helpers'
import type { DaemonClient } from '../../daemon/client'

interface ProjectDeps {
  daemonClient: DaemonClient
}

export function createProjectRouter(deps: ProjectDeps) {
  return t.router({
    list: t.procedure
      .query(async () => {
        if (!deps.daemonClient.isConnected()) return []
        return await deps.daemonClient.listProjects()
      }),

    add: t.procedure
      .input(z.object({
        id: z.string(),
        path: z.string(),
        name: z.string(),
        color: z.string(),
        icon: z.string().nullable(),
        sortOrder: z.number(),
      }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.addProject(
          input.id,
          { path: input.path, name: input.name, color: input.color, icon: input.icon },
          input.sortOrder,
        )
      }),

    update: t.procedure
      .input(z.object({
        id: z.string(),
        patch: z.object({
          name: z.string().optional(),
          color: z.string().optional(),
          icon: z.string().nullable().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.updateProject(input.id, input.patch)
      }),

    remove: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.removeProject(input.id)
      }),

    reorder: t.procedure
      .input(z.object({ idsInOrder: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.reorderProjects(input.idsInOrder)
      }),

    onListChanged: createSubscription('project:listChanged'),
  })
}
