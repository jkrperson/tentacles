import { z } from 'zod'
import { app, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { t } from '../trpc'
import { ee } from '../events'
import { createSubscription } from '../helpers'

const SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']

interface AppDeps {
  settingsPath: string
  sessionsPath: string
  uiPrefsPath: string
  themesDir: string
  soundsDir: string
  getWindow: () => BrowserWindow | null
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

    loadUiPrefs: t.procedure
      .query(() => {
        try {
          return JSON.parse(fs.readFileSync(deps.uiPrefsPath, 'utf-8')) as {
            tabOrder?: string[]
            activeSessionId?: string | null
            hasUnread?: Record<string, boolean>
          }
        } catch { return {} }
      }),

    saveUiPrefs: t.procedure
      .input(z.object({
        tabOrder: z.array(z.string()),
        activeSessionId: z.string().nullable(),
        hasUnread: z.record(z.string(), z.boolean()),
      }))
      .mutation(({ input }) => {
        const tmp = `${deps.uiPrefsPath}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(input, null, 2))
        fs.renameSync(tmp, deps.uiPrefsPath)
      }),

    // Main fires `app:requestFlush` on quit; renderer writes its latest state via
    // saveSessions then calls confirmFlushed so main can proceed with shutdown.
    onRequestFlush: createSubscription('app:requestFlush'),

    confirmFlushed: t.procedure
      .mutation(() => {
        ee.emit('app:flushed', {})
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

    // --- Custom Sounds ---
    listCustomSounds: t.procedure
      .query(() => {
        try {
          if (!fs.existsSync(deps.soundsDir)) return []
          const files = fs.readdirSync(deps.soundsDir)
            .filter((f) => SOUND_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
          return files.map((filename) => ({
            key: `custom:${filename}`,
            name: filename.replace(/\.[^.]+$/, ''),
            filename,
          }))
        } catch {
          return []
        }
      }),

    addCustomSound: t.procedure
      .mutation(async () => {
        const win = deps.getWindow()
        if (!win) return null
        const result = await dialog.showOpenDialog(win, {
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
        })
        if (result.canceled || result.filePaths.length === 0) return null
        if (!fs.existsSync(deps.soundsDir)) {
          fs.mkdirSync(deps.soundsDir, { recursive: true })
        }
        const added: Array<{ key: string; name: string; filename: string }> = []
        for (const filePath of result.filePaths) {
          const filename = path.basename(filePath)
          const dest = path.join(deps.soundsDir, filename)
          fs.copyFileSync(filePath, dest)
          added.push({
            key: `custom:${filename}`,
            name: filename.replace(/\.[^.]+$/, ''),
            filename,
          })
        }
        return added
      }),

    deleteCustomSound: t.procedure
      .input(z.object({ key: z.string() }))
      .mutation(({ input }) => {
        const filename = input.key.replace(/^custom:/, '')
        const filePath = path.join(deps.soundsDir, filename)
        try {
          fs.unlinkSync(filePath)
        } catch {
          // Already deleted
        }
      }),

    getSoundData: t.procedure
      .input(z.object({ key: z.string() }))
      .query(({ input }) => {
        const filename = input.key.replace(/^custom:/, '')
        const filePath = path.join(deps.soundsDir, filename)
        try {
          const data = fs.readFileSync(filePath)
          const ext = path.extname(filename).toLowerCase()
          const mimeMap: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.flac': 'audio/flac',
          }
          return {
            data: data.toString('base64'),
            mimeType: mimeMap[ext] ?? 'audio/mpeg',
          }
        } catch {
          return null
        }
      }),

    openSoundsFolder: t.procedure
      .mutation(() => {
        if (!fs.existsSync(deps.soundsDir)) {
          fs.mkdirSync(deps.soundsDir, { recursive: true })
        }
        shell.openPath(deps.soundsDir)
      }),

    checkAgentInstalled: t.procedure
      .input(z.object({ command: z.string() }))
      .query(({ input }) => {
        // Extract the binary name (first token) from the full command string
        const binary = input.command.trim().split(/\s+/)[0]
        if (!binary) return false
        const whichCmd = process.platform === 'win32' ? 'where' : 'which'
        return new Promise<boolean>((resolve) => {
          execFile(whichCmd, [binary], (err) => {
            resolve(!err)
          })
        })
      }),
  })
}
