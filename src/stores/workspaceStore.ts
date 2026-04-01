import { create } from 'zustand'
import { trpc } from '../trpc'
import { useProjectConfigStore } from './projectConfigStore'
import type { Workspace, WorkspaceType } from '../types'

interface WorkspaceState {
  workspaces: Map<string, Workspace>
  workspaceOrder: string[]

  ensureMainWorkspace: (projectId: string) => Workspace
  createWorktreeWorkspace: (projectId: string, name?: string) => Promise<Workspace>
  deleteWorktreeWorkspace: (id: string) => Promise<void>
  reorderWorkspaces: (fromIndex: number, toIndex: number, projectId: string) => void
  getProjectWorkspaces: (projectId: string) => Workspace[]
  getWorkspaceCwd: (id: string) => string | null
  loadWorkspaces: (workspaces: Workspace[]) => void
  setWorkspaces: (workspaces: Map<string, Workspace>, order: string[]) => void
  removeWorkspace: (id: string) => void
}

function makeMainId(projectId: string): string {
  return `main:${projectId}`
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: new Map(),
  workspaceOrder: [],

  ensureMainWorkspace: (projectId: string) => {
    const { workspaces } = get()
    const id = makeMainId(projectId)
    const existing = workspaces.get(id)
    if (existing) return existing

    const workspace: Workspace = {
      id,
      projectId,
      type: 'main' as WorkspaceType,
      branch: '', // will be filled when git info is available
      worktreePath: null,
      status: 'active',
      createdAt: Date.now(),
      name: 'main',
    }

    set((state) => {
      const ws = new Map(state.workspaces)
      ws.set(id, workspace)
      return { workspaces: ws, workspaceOrder: [...state.workspaceOrder, id] }
    })
    return workspace
  },

  createWorktreeWorkspace: async (projectId: string, name?: string) => {
    const { worktreePath, branch } = await trpc.git.worktree.create.mutate({ repoPath: projectId, name })
    const id = `worktree:${worktreePath}`
    const workspace: Workspace = {
      id,
      projectId,
      type: 'worktree',
      branch,
      worktreePath,
      status: 'active',
      createdAt: Date.now(),
      name: name || branch,
    }

    set((state) => {
      const ws = new Map(state.workspaces)
      ws.set(id, workspace)
      return { workspaces: ws, workspaceOrder: [...state.workspaceOrder, id] }
    })

    // Fire-and-forget: run setup scripts if configured
    const configStore = useProjectConfigStore.getState()
    const config = configStore.configs.get(projectId)
    if (config && config.setupScripts.some((s) => s.enabled)) {
      configStore.runSetupScripts(projectId, id, worktreePath).catch(() => {})
    } else {
      // Config might not be loaded yet — load and check
      configStore.loadConfig(projectId).then(() => {
        const loaded = useProjectConfigStore.getState().configs.get(projectId)
        if (loaded && loaded.setupScripts.some((s) => s.enabled)) {
          configStore.runSetupScripts(projectId, id, worktreePath).catch(() => {})
        }
      }).catch(() => {})
    }

    return workspace
  },

  deleteWorktreeWorkspace: async (id: string) => {
    const { workspaces } = get()
    const ws = workspaces.get(id)
    if (!ws || ws.type !== 'worktree' || !ws.worktreePath) return

    await trpc.git.worktree.remove.mutate({ repoPath: ws.projectId, worktreePath: ws.worktreePath, branch: ws.branch })

    set((state) => {
      const next = new Map(state.workspaces)
      next.delete(id)
      return { workspaces: next, workspaceOrder: state.workspaceOrder.filter((wid) => wid !== id) }
    })
  },

  reorderWorkspaces: (fromIndex, toIndex, projectId) => {
    const { workspaceOrder, workspaces } = get()
    // Get project-scoped worktree indices (skip main — it stays first)
    const worktreeIndices: number[] = []
    for (let i = 0; i < workspaceOrder.length; i++) {
      const ws = workspaces.get(workspaceOrder[i])
      if (ws && ws.projectId === projectId && ws.type !== 'main') {
        worktreeIndices.push(i)
      }
    }
    if (fromIndex < 0 || fromIndex >= worktreeIndices.length || toIndex < 0 || toIndex >= worktreeIndices.length) return
    if (fromIndex === toIndex) return

    const worktreeIds = worktreeIndices.map((i) => workspaceOrder[i])
    const [moved] = worktreeIds.splice(fromIndex, 1)
    worktreeIds.splice(toIndex, 0, moved)

    const next = [...workspaceOrder]
    for (let i = 0; i < worktreeIndices.length; i++) {
      next[worktreeIndices[i]] = worktreeIds[i]
    }
    set({ workspaceOrder: next })
  },

  getProjectWorkspaces: (projectId: string) => {
    const { workspaces, workspaceOrder } = get()
    // Main always first, worktrees in workspaceOrder sequence
    const main: Workspace[] = []
    const worktrees: Workspace[] = []
    for (const id of workspaceOrder) {
      const ws = workspaces.get(id)
      if (!ws || ws.projectId !== projectId) continue
      if (ws.type === 'main') main.push(ws)
      else worktrees.push(ws)
    }
    return [...main, ...worktrees]
  },

  getWorkspaceCwd: (id: string) => {
    const ws = get().workspaces.get(id)
    if (!ws) return null
    return ws.worktreePath ?? ws.projectId
  },

  loadWorkspaces: (workspaceList: Workspace[]) => {
    const workspaces = new Map<string, Workspace>()
    const workspaceOrder: string[] = []
    for (const ws of workspaceList) {
      workspaces.set(ws.id, ws)
      workspaceOrder.push(ws.id)
    }
    set({ workspaces, workspaceOrder })
  },

  setWorkspaces: (workspaces, order) => {
    set({ workspaces, workspaceOrder: order })
  },

  removeWorkspace: (id: string) => {
    set((state) => {
      const ws = new Map(state.workspaces)
      ws.delete(id)
      return { workspaces: ws, workspaceOrder: state.workspaceOrder.filter((wid) => wid !== id) }
    })
  },
}))

/** Check if a session belongs to a given project via its workspace */
export function sessionBelongsToProject(
  workspaceId: string,
  projectPath: string,
  workspaces: Map<string, Workspace>,
): boolean {
  const ws = workspaces.get(workspaceId)
  return ws?.projectId === projectPath
}
