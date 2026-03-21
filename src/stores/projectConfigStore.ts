import { create } from 'zustand'
import { trpc } from '../trpc'
import type { ProjectConfig, SetupLogEntry } from '../types'

interface ProjectConfigState {
  configs: Map<string, ProjectConfig>
  setupLogs: Map<string, SetupLogEntry>
  runningSetups: Set<string>

  loadConfig(projectPath: string): Promise<void>
  saveConfig(projectPath: string, config: ProjectConfig): Promise<void>
  loadSetupLog(workspaceId: string): Promise<void>
  runSetupScripts(projectPath: string, workspaceId: string, cwd: string): Promise<void>
}

let subscribed = false

function ensureSubscriptions() {
  if (subscribed) return
  subscribed = true

  trpc.projectConfig.onSetupOutput.subscribe(undefined, {
    onData: (data) => {
      const { workspaceId, scriptIndex, data: text } = data
      const state = useProjectConfigStore.getState()
      const existing = state.setupLogs.get(workspaceId)
      if (!existing) return

      const scripts = [...existing.scripts]
      // Ensure the script entry exists
      while (scripts.length <= scriptIndex) {
        scripts.push({ command: '', exitCode: null, output: '' })
      }
      scripts[scriptIndex] = {
        ...scripts[scriptIndex],
        output: scripts[scriptIndex].output + text,
      }

      const updated = { ...existing, scripts }
      useProjectConfigStore.setState((s) => {
        const logs = new Map(s.setupLogs)
        logs.set(workspaceId, updated)
        return { setupLogs: logs }
      })
    },
  })

  trpc.projectConfig.onSetupComplete.subscribe(undefined, {
    onData: ({ workspaceId, log }) => {
      useProjectConfigStore.setState((s) => {
        const logs = new Map(s.setupLogs)
        logs.set(workspaceId, log)
        const running = new Set(s.runningSetups)
        running.delete(workspaceId)
        return { setupLogs: logs, runningSetups: running }
      })
    },
  })
}

export const useProjectConfigStore = create<ProjectConfigState>((set) => ({
  configs: new Map(),
  setupLogs: new Map(),
  runningSetups: new Set(),

  loadConfig: async (projectPath) => {
    const config = await trpc.projectConfig.getConfig.query({ projectPath })
    set((s) => {
      const configs = new Map(s.configs)
      configs.set(projectPath, config)
      return { configs }
    })
  },

  saveConfig: async (projectPath, config) => {
    await trpc.projectConfig.saveConfig.mutate({ projectPath, config })
    set((s) => {
      const configs = new Map(s.configs)
      configs.set(projectPath, config)
      return { configs }
    })
  },

  loadSetupLog: async (workspaceId) => {
    const log = await trpc.projectConfig.getSetupLog.query({ workspaceId })
    if (log) {
      set((s) => {
        const logs = new Map(s.setupLogs)
        logs.set(workspaceId, log)
        return { setupLogs: logs }
      })
    }
  },

  runSetupScripts: async (projectPath, workspaceId, cwd) => {
    ensureSubscriptions()

    // Initialize an empty log for live streaming
    const initialLog: SetupLogEntry = {
      workspaceId,
      projectPath,
      startedAt: Date.now(),
      scripts: [],
    }

    set((s) => {
      const logs = new Map(s.setupLogs)
      logs.set(workspaceId, initialLog)
      const running = new Set(s.runningSetups)
      running.add(workspaceId)
      return { setupLogs: logs, runningSetups: running }
    })

    try {
      const log = await trpc.projectConfig.runSetupScripts.mutate({ projectPath, workspaceId, cwd })
      set((s) => {
        const logs = new Map(s.setupLogs)
        logs.set(workspaceId, log)
        const running = new Set(s.runningSetups)
        running.delete(workspaceId)
        return { setupLogs: logs, runningSetups: running }
      })
    } catch {
      set((s) => {
        const running = new Set(s.runningSetups)
        running.delete(workspaceId)
        return { runningSetups: running }
      })
    }
  },
}))
