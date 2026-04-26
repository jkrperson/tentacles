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
  reorderWorkspaces: (fromIndex: number, toIndex: number, projectId: string) => Promise<void>
  getProjectWorkspaces: (projectId: string) => Workspace[]
  getWorkspaceCwd: (id: string) => string | null
  loadFromDaemon: () => Promise<void>
  refreshFromDaemon: () => Promise<void>
  removeWorkspace: (id: string) => void
}

function makeMainId(projectId: string): string {
  return `main:${projectId}`
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: new Map(),
  workspaceOrder: [],

  ensureMainWorkspace: (projectId: string): Workspace => {
    const { workspaces } = get()
    const id = makeMainId(projectId)
    const existing = workspaces.get(id)
    if (existing) return existing

    const workspace: Workspace = {
      id,
      projectId,
      type: 'main' as WorkspaceType,
      branch: '',
      worktreePath: null,
      status: 'active',
      createdAt: Date.now(),
      name: 'main',
    }
    // Optimistic local insert; daemon mirror via mutate (event will reconcile).
    set((state) => {
      const ws = new Map(state.workspaces)
      ws.set(id, workspace)
      return { workspaces: ws, workspaceOrder: [...state.workspaceOrder, id] }
    })
    trpc.workspace.add.mutate({
      id, projectId, type: 'main', branch: '', worktreePath: null,
      linkedPr: null, linkedIssue: null, status: 'active', name: 'main',
      sortOrder: get().workspaceOrder.length - 1,
    }).catch((err) => console.error('[workspaceStore] ensureMainWorkspace add failed:', err))
    return workspace
  },

  createWorktreeWorkspace: async (projectId, name) => {
    const { worktreePath, branch } = await trpc.git.worktree.create.mutate({ repoPath: projectId, name })
    const id = `worktree:${worktreePath}`
    const workspace: Workspace = {
      id, projectId, type: 'worktree',
      branch, worktreePath, status: 'active',
      createdAt: Date.now(), name: name || branch,
    }
    await trpc.workspace.add.mutate({
      id, projectId, type: 'worktree', branch, worktreePath,
      linkedPr: null, linkedIssue: null, status: 'active',
      name: name || branch, sortOrder: get().workspaceOrder.length,
    })
    // Setup scripts logic (preserved verbatim from existing code)
    const configStore = useProjectConfigStore.getState()
    const config = configStore.configs.get(projectId)
    if (config && config.setupScripts.some((s) => s.enabled)) {
      configStore.runSetupScripts(projectId, id, worktreePath).catch(() => {})
    } else {
      configStore.loadConfig(projectId).then(() => {
        const loaded = useProjectConfigStore.getState().configs.get(projectId)
        if (loaded && loaded.setupScripts.some((s) => s.enabled)) {
          configStore.runSetupScripts(projectId, id, worktreePath).catch(() => {})
        }
      }).catch(() => {})
    }
    return workspace
  },

  deleteWorktreeWorkspace: async (id) => {
    const { workspaces } = get()
    const ws = workspaces.get(id)
    if (!ws || ws.type !== 'worktree' || !ws.worktreePath) return

    // Mark as tearing down so the UI can show a non-interactive state
    set((state) => {
      const next = new Map(state.workspaces)
      const updated = { ...ws, status: 'tearing_down' as const }
      next.set(id, updated)
      return { workspaces: next }
    })

    try {
      await trpc.git.worktree.remove.mutate({ repoPath: ws.projectId, worktreePath: ws.worktreePath, branch: ws.branch })
    } finally {
      await trpc.workspace.remove.mutate({ id }).catch((err) =>
        console.error('[workspaceStore] remove from daemon failed:', err))
      // Live update arrives via workspace:listChanged subscription.
    }
  },

  reorderWorkspaces: async (fromIndex, toIndex, projectId) => {
    const projectWorkspaces = get().getProjectWorkspaces(projectId)
    if (fromIndex < 0 || fromIndex >= projectWorkspaces.length) return
    if (toIndex < 0 || toIndex >= projectWorkspaces.length) return
    const ids = projectWorkspaces.map((w) => w.id)
    const [moved] = ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, moved)
    await trpc.workspace.reorder.mutate({ projectId, idsInOrder: ids })
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

  loadFromDaemon: async () => {
    try {
      const daemonWorkspaces = await trpc.workspace.list.query()
      const workspaces = new Map<string, Workspace>()
      const workspaceOrder: string[] = []
      for (const dw of daemonWorkspaces) {
        workspaces.set(dw.id, {
          id: dw.id,
          projectId: dw.projectId,
          type: dw.type,
          branch: dw.branch,
          worktreePath: dw.worktreePath,
          linkedPR: dw.linkedPr ?? undefined,
          linkedIssue: dw.linkedIssue ?? undefined,
          status: dw.status,
          createdAt: dw.createdAt,
          name: dw.name,
        })
        workspaceOrder.push(dw.id)
      }
      set({ workspaces, workspaceOrder })
    } catch (err) {
      console.error('[workspaceStore] loadFromDaemon failed:', err)
    }
  },

  refreshFromDaemon: async () => {
    try {
      const daemonWorkspaces = await trpc.workspace.list.query()
      const workspaces = new Map<string, Workspace>()
      const workspaceOrder: string[] = []
      for (const dw of daemonWorkspaces) {
        workspaces.set(dw.id, {
          id: dw.id,
          projectId: dw.projectId,
          type: dw.type,
          branch: dw.branch,
          worktreePath: dw.worktreePath,
          linkedPR: dw.linkedPr ?? undefined,
          linkedIssue: dw.linkedIssue ?? undefined,
          status: dw.status,
          createdAt: dw.createdAt,
          name: dw.name,
        })
        workspaceOrder.push(dw.id)
      }
      set({ workspaces, workspaceOrder })
    } catch (err) {
      console.error('[workspaceStore] refreshFromDaemon failed:', err)
    }
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
