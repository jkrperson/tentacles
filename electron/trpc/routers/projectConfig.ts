import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { exec } from 'node:child_process'
import { observable } from '@trpc/server/observable'
import { t } from '../trpc'
import { ee } from '../events'
import type { ProjectConfig, SetupLogEntry } from '../../../src/types'

interface ProjectConfigDeps {
  projectsConfigDir: string
}

function hashPath(projectPath: string): string {
  return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16)
}

export function createProjectConfigRouter(deps: ProjectConfigDeps) {
  const logsDir = path.join(deps.projectsConfigDir, 'setup-logs')

  function configPath(projectPath: string): string {
    return path.join(deps.projectsConfigDir, `${hashPath(projectPath)}.json`)
  }

  function logPath(workspaceId: string): string {
    return path.join(logsDir, `${hashPath(workspaceId)}.json`)
  }

  function readConfig(projectPath: string): ProjectConfig {
    try {
      return JSON.parse(fs.readFileSync(configPath(projectPath), 'utf-8'))
    } catch {
      return { projectPath, setupScripts: [] }
    }
  }

  return t.router({
    getConfig: t.procedure
      .input(z.object({ projectPath: z.string() }))
      .query(({ input }) => {
        return readConfig(input.projectPath)
      }),

    saveConfig: t.procedure
      .input(z.object({
        projectPath: z.string(),
        config: z.object({
          projectPath: z.string(),
          setupScripts: z.array(z.object({
            id: z.string(),
            command: z.string(),
            enabled: z.boolean(),
          })),
        }),
      }))
      .mutation(({ input }) => {
        fs.mkdirSync(deps.projectsConfigDir, { recursive: true })
        fs.writeFileSync(configPath(input.projectPath), JSON.stringify(input.config, null, 2), 'utf-8')
      }),

    getSetupLog: t.procedure
      .input(z.object({ workspaceId: z.string() }))
      .query(({ input }): SetupLogEntry | null => {
        try {
          return JSON.parse(fs.readFileSync(logPath(input.workspaceId), 'utf-8'))
        } catch {
          return null
        }
      }),

    runSetupScripts: t.procedure
      .input(z.object({
        projectPath: z.string(),
        workspaceId: z.string(),
        cwd: z.string(),
      }))
      .mutation(async ({ input }): Promise<SetupLogEntry> => {
        const config = readConfig(input.projectPath)
        const enabledScripts = config.setupScripts.filter((s) => s.enabled)

        const log: SetupLogEntry = {
          workspaceId: input.workspaceId,
          projectPath: input.projectPath,
          startedAt: Date.now(),
          scripts: [],
        }

        for (let i = 0; i < enabledScripts.length; i++) {
          const script = enabledScripts[i]
          const result = await new Promise<{ exitCode: number | null; output: string }>((resolve) => {
            let output = ''
            const child = exec(script.command, { cwd: input.cwd, timeout: 300000 })

            const onData = (data: Buffer | string) => {
              const text = data.toString()
              output += text
              ee.emit('setup:output', { workspaceId: input.workspaceId, scriptIndex: i, data: text })
            }

            child.stdout?.on('data', onData)
            child.stderr?.on('data', onData)

            child.on('close', (code) => {
              resolve({ exitCode: code, output })
            })

            child.on('error', (err) => {
              output += err.message
              resolve({ exitCode: 1, output })
            })
          })

          log.scripts.push({
            command: script.command,
            exitCode: result.exitCode,
            output: result.output,
          })
        }

        log.completedAt = Date.now()

        // Persist log
        fs.mkdirSync(logsDir, { recursive: true })
        fs.writeFileSync(logPath(input.workspaceId), JSON.stringify(log, null, 2), 'utf-8')

        ee.emit('setup:complete', { workspaceId: input.workspaceId, log })
        return log
      }),

    onSetupOutput: t.procedure.subscription(() => {
      return observable<{ workspaceId: string; scriptIndex: number; data: string }>((emit) => {
        const handler = (data: { workspaceId: string; scriptIndex: number; data: string }) => emit.next(data)
        ee.on('setup:output', handler)
        return () => { ee.off('setup:output', handler) }
      })
    }),

    onSetupComplete: t.procedure.subscription(() => {
      return observable<{ workspaceId: string; log: SetupLogEntry }>((emit) => {
        const handler = (data: { workspaceId: string; log: SetupLogEntry }) => emit.next(data)
        ee.on('setup:complete', handler)
        return () => { ee.off('setup:complete', handler) }
      })
    }),
  })
}
