import { z } from 'zod'
import { app } from 'electron'
import * as fs from 'node:fs'
import { t } from '../trpc'

interface AppDeps {
  settingsPath: string
  sessionsPath: string
}

export function createAppRouter(deps: AppDeps) {
  return t.router({
    getVersion: t.procedure
      .query(() => {
        return app.getVersion()
      }),

    getSettings: t.procedure
      .query(() => {
        try {
          return JSON.parse(fs.readFileSync(deps.settingsPath, 'utf-8'))
        } catch {
          return {}
        }
      }),

    saveSettings: t.procedure
      .input(z.record(z.string(), z.unknown()))
      .mutation(({ input }) => {
        fs.writeFileSync(deps.settingsPath, JSON.stringify(input, null, 2))
      }),

    getPlatform: t.procedure
      .query(() => {
        return process.platform
      }),

    getHomePath: t.procedure
      .query(() => {
        return app.getPath('home')
      }),

    loadSessions: t.procedure
      .query(() => {
        try {
          return JSON.parse(fs.readFileSync(deps.sessionsPath, 'utf-8'))
        } catch {
          return { sessions: [], archived: [], activeSessionId: null }
        }
      }),

    saveSessions: t.procedure
      .input(z.record(z.string(), z.unknown()))
      .mutation(({ input }) => {
        fs.writeFileSync(deps.sessionsPath, JSON.stringify(input, null, 2))
      }),
  })
}
