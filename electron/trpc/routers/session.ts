import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { PtyManager } from '../../ptyManager'
import type { AgentType } from '../../agents/types'

interface SessionDeps {
  ptyManager: PtyManager
  spawnAgent: (name: string, cwd: string, agentType: AgentType, resumeId?: string) => { id: string; pid: number; tmuxSessionName?: string; hookId: string }
  reattachAgent: (tmuxSessionName: string, hookId: string, name: string, cwd: string, agentType?: AgentType) => { id: string; pid: number; tmuxSessionName: string; paneTitle?: string; initialStatusDetail?: string | null; recoveredClaudeSessionId?: string } | null
}

export function createSessionRouter(deps: SessionDeps) {
  return t.router({
    create: t.procedure
      .input(z.object({ name: z.string(), cwd: z.string(), agentType: z.string().optional() }))
      .mutation(({ input }) => {
        return deps.spawnAgent(input.name, input.cwd, (input.agentType as AgentType) ?? 'claude')
      }),

    resume: t.procedure
      .input(z.object({ claudeSessionId: z.string(), name: z.string(), cwd: z.string(), agentType: z.string().optional() }))
      .mutation(({ input }) => {
        return deps.spawnAgent(input.name, input.cwd, (input.agentType as AgentType) ?? 'claude', input.claudeSessionId)
      }),

    reattach: t.procedure
      .input(z.object({ tmuxSessionName: z.string(), hookId: z.string(), name: z.string(), cwd: z.string(), agentType: z.string().optional() }))
      .mutation(({ input }) => {
        return deps.reattachAgent(input.tmuxSessionName, input.hookId, input.name, input.cwd, input.agentType as AgentType | undefined)
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
        deps.ptyManager.killWithTmux(input.id)
      }),

    list: t.procedure
      .query(() => {
        return deps.ptyManager.list()
      }),

    // Subscriptions for main→renderer events
    onData: t.procedure.subscription(() => {
      return observable<{ id: string; data: string }>((emit) => {
        const handler = (data: { id: string; data: string }) => emit.next(data)
        ee.on('session:data', handler)
        return () => { ee.off('session:data', handler) }
      })
    }),

    onExit: t.procedure.subscription(() => {
      return observable<{ id: string; exitCode: number }>((emit) => {
        const handler = (data: { id: string; exitCode: number }) => emit.next(data)
        ee.on('session:exit', handler)
        return () => { ee.off('session:exit', handler) }
      })
    }),

    onTitle: t.procedure.subscription(() => {
      return observable<{ id: string; title: string }>((emit) => {
        const handler = (data: { id: string; title: string }) => emit.next(data)
        ee.on('session:title', handler)
        return () => { ee.off('session:title', handler) }
      })
    }),

    onClaudeSessionId: t.procedure.subscription(() => {
      return observable<{ id: string; claudeSessionId: string }>((emit) => {
        const handler = (data: { id: string; claudeSessionId: string }) => emit.next(data)
        ee.on('session:claudeSessionId', handler)
        return () => { ee.off('session:claudeSessionId', handler) }
      })
    }),

    onStatusDetail: t.procedure.subscription(() => {
      return observable<{ id: string; detail: string | null }>((emit) => {
        const handler = (data: { id: string; detail: string | null }) => emit.next(data)
        ee.on('session:statusDetail', handler)
        return () => { ee.off('session:statusDetail', handler) }
      })
    }),

    onAgentStatus: t.procedure.subscription(() => {
      return observable<{ id: string; status: 'running' | 'idle' }>((emit) => {
        const handler = (data: { id: string; status: 'running' | 'idle' }) => emit.next(data)
        ee.on('session:agentStatus', handler)
        return () => { ee.off('session:agentStatus', handler) }
      })
    }),
  })
}
