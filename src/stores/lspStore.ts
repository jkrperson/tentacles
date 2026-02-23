import { create } from 'zustand'

interface LspServerInfo {
  status: 'starting' | 'running' | 'stopped'
  port: number | null
  projectRoot: string
}

interface LspState {
  servers: Map<string, LspServerInfo>

  startServer: (languageId: string, projectRoot: string) => Promise<number | null>
  stopServer: (languageId: string, projectRoot: string) => Promise<void>
  getServerPort: (languageId: string, projectRoot: string) => number | null
}

function serverKey(languageId: string, projectRoot: string): string {
  return `${languageId}:${projectRoot}`
}

export const useLspStore = create<LspState>((set, get) => ({
  servers: new Map(),

  startServer: async (languageId, projectRoot) => {
    const key = serverKey(languageId, projectRoot)
    const existing = get().servers.get(key)
    if (existing?.status === 'running' && existing.port) return existing.port
    if (existing?.status === 'starting') return null

    // Mark as starting
    set((state) => {
      const servers = new Map(state.servers)
      servers.set(key, { status: 'starting', port: null, projectRoot })
      return { servers }
    })

    try {
      const { port } = await window.electronAPI.lsp.start(languageId, projectRoot)
      set((state) => {
        const servers = new Map(state.servers)
        servers.set(key, { status: 'running', port, projectRoot })
        return { servers }
      })
      return port
    } catch (err) {
      console.error(`[LSP] Failed to start ${languageId}:`, err)
      set((state) => {
        const servers = new Map(state.servers)
        servers.delete(key)
        return { servers }
      })
      return null
    }
  },

  stopServer: async (languageId, projectRoot) => {
    const key = serverKey(languageId, projectRoot)
    try {
      await window.electronAPI.lsp.stop(languageId, projectRoot)
    } catch {
      // already stopped
    }
    set((state) => {
      const servers = new Map(state.servers)
      servers.delete(key)
      return { servers }
    })
  },

  getServerPort: (languageId, projectRoot) => {
    const key = serverKey(languageId, projectRoot)
    return get().servers.get(key)?.port ?? null
  },
}))
