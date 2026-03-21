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

    await trpc.git.worktree.remove.mutate({ repoPath: ws.projectId, worktreePath: ws.worktreePath })

    set((state) => {
      const next = new Map(state.workspaces)
      next.delete(id)
      return { workspaces: next, workspaceOrder: state.workspaceOrder.filter((wid) => wid !== id) }
    })
  },

  getProjectWorkspaces: (projectId: string) => {
    const { workspaces, workspaceOrder } = get()
    return workspaceOrder
      .map((id) => workspaces.get(id))
      .filter((ws): ws is Workspace => ws != null && ws.projectId === projectId)
      .sort((a, b) => {
        // main first, then by creation time
        if (a.type === 'main' && b.type !== 'main') return -1
        if (a.type !== 'main' && b.type === 'main') return 1
        return a.createdAt - b.createdAt
      })
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
