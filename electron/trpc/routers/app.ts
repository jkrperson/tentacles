import { z } from 'zod'
import { app, shell } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { t } from '../trpc'

interface AppDeps {
  settingsPath: string
  sessionsPath: string
  themesDir: string
}

const customThemeSchema = z.object({
  name: z.string().min(1).max(50),
  appearance: z.enum(['dark', 'light']).optional(),
  author: z.string().max(100).optional(),
  base: z.enum(['obsidian', 'midnight', 'ember', 'monokai', 'dawn']),
  ui: z.record(z.string(), z.string()).optional(),
  terminal: z.record(z.string(), z.string()).optional(),
  git: z.record(z.string(), z.string()).optional(),
  status: z.record(z.string(), z.string()).optional(),
  zincOverrides: z.record(z.string(), z.string()).optional(),
})

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
          return { sessions: [], activeSessionId: null }
        }
      }),

    saveSessions: t.procedure
      .input(z.record(z.string(), z.unknown()))
      .mutation(({ input }) => {
        fs.writeFileSync(deps.sessionsPath, JSON.stringify(input, null, 2))
      }),

    listCustomThemes: t.procedure
      .query(() => {
        try {
          if (!fs.existsSync(deps.themesDir)) return []
          const files = fs.readdirSync(deps.themesDir).filter((f) => f.endsWith('.json'))
          const results: Array<{ key: string; file: z.infer<typeof customThemeSchema> }> = []
          for (const file of files) {
            try {
              const raw = JSON.parse(fs.readFileSync(path.join(deps.themesDir, file), 'utf-8'))
              const parsed = customThemeSchema.parse(raw)
              const key = `custom:${file.replace(/\.json$/, '')}`
              results.push({ key, file: parsed })
            } catch {
              // Skip malformed files
            }
          }
          return results
        } catch {
          return []
        }
      }),

    duplicateTheme: t.procedure
      .input(z.object({ base: z.string(), fileName: z.string() }))
      .mutation(({ input }) => {
        if (!fs.existsSync(deps.themesDir)) {
          fs.mkdirSync(deps.themesDir, { recursive: true })
        }
        // Sanitize filename
        const safeName = input.fileName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
        const filePath = path.join(deps.themesDir, `${safeName}.json`)
        // Resolve base: if it's a custom: key, use its base; otherwise use directly
        const resolvedBase = input.base.startsWith('custom:') ? 'obsidian' : input.base
        const validBases = ['obsidian', 'midnight', 'ember', 'monokai', 'dawn']
        const base = validBases.includes(resolvedBase) ? resolvedBase : 'obsidian'
        const themeFile = {
          name: input.fileName,
          base,
          ui: {},
          terminal: {},
        }
        fs.writeFileSync(filePath, JSON.stringify(themeFile, null, 2))
        return `custom:${safeName}`
      }),

    deleteCustomTheme: t.procedure
      .input(z.object({ key: z.string() }))
      .mutation(({ input }) => {
        const fileName = input.key.replace(/^custom:/, '')
        const filePath = path.join(deps.themesDir, `${fileName}.json`)
        try {
          fs.unlinkSync(filePath)
        } catch {
          // Already deleted
        }
        // If active theme matches, reset to obsidian
        try {
          const settings = JSON.parse(fs.readFileSync(deps.settingsPath, 'utf-8'))
          if (settings.theme === input.key) {
            settings.theme = 'obsidian'
            fs.writeFileSync(deps.settingsPath, JSON.stringify(settings, null, 2))
          }
        } catch {
          // Ignore
        }
      }),

    openThemesFolder: t.procedure
      .mutation(() => {
        if (!fs.existsSync(deps.themesDir)) {
          fs.mkdirSync(deps.themesDir, { recursive: true })
        }
        shell.openPath(deps.themesDir)
      }),

    openExternal: t.procedure
      .input(z.object({ url: z.string() }))
      .mutation(({ input }) => {
        shell.openExternal(input.url)
      }),
  })
}
