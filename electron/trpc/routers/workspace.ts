import { z } from 'zod'
import { t } from '../trpc'
import { createSubscription } from '../helpers'
import type { DaemonClient } from '../../daemon/client'

interface WorkspaceDeps {
  daemonClient: DaemonClient
}

const workspaceTypeSchema = z.enum(['main', 'worktree'])
const workspaceStatusSchema = z.enum(['active', 'merged', 'stale', 'tearing_down'])

export function createWorkspaceRouter(deps: WorkspaceDeps) {
  return t.router({
    list: t.procedure
      .input(z.object({ projectId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        if (!deps.daemonClient.isConnected()) return []
        return await deps.daemonClient.listWorkspaces(input?.projectId)
      }),

    add: t.procedure
      .input(z.object({
        id: z.string(),
        projectId: z.string(),
        type: workspaceTypeSchema,
        branch: z.string(),
        worktreePath: z.string().nullable(),
        linkedPr: z.string().nullable(),
        linkedIssue: z.string().nullable(),
        status: workspaceStatusSchema,
        name: z.string(),
        sortOrder: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { id, sortOrder, ...metadata } = input
        await deps.daemonClient.addWorkspace(id, metadata, sortOrder)
      }),

    update: t.procedure
      .input(z.object({
        id: z.string(),
        patch: z.object({
          branch: z.string().optional(),
          worktreePath: z.string().nullable().optional(),
          linkedPr: z.string().nullable().optional(),
          linkedIssue: z.string().nullable().optional(),
          status: workspaceStatusSchema.optional(),
          name: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.updateWorkspace(input.id, input.patch)
      }),

    remove: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.removeWorkspace(input.id)
      }),

    reorder: t.procedure
      .input(z.object({ projectId: z.string(), idsInOrder: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        await deps.daemonClient.reorderWorkspaces(input.projectId, input.idsInOrder)
      }),

    onListChanged: createSubscription('workspace:listChanged'),
  })
}
