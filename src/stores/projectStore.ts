import { create } from 'zustand'
import { trpc } from '../trpc'
import type { Project, ProjectFileTreeState, FileNode, GitFileStatus, GitStatusDetailResult, DiffViewState, FileDiffStat } from '../types'
import { PROJECT_COLORS } from '../types'
import { useUIStore } from './uiStore'

interface ProjectState {
  projects: Map<string, Project>
  activeProjectId: string | null
  projectOrder: string[]
  fileTreeCache: Map<string, ProjectFileTreeState>

  addProject: (path: string) => Promise<void>
  removeProject: (path: string) => Promise<void>
  setProjectColor: (path: string, color: string) => Promise<void>
  setProjectIcon: (path: string, icon: string) => Promise<void>
  reorderProjects: (fromIndex: number, toIndex: number) => Promise<void>
  setActiveProject: (path: string | null) => void
  loadProjects: () => Promise<void>
  refreshFromDaemon: () => Promise<void>

  // File tree cache actions
  setFileTreeNodes: (projectId: string, nodes: FileNode[]) => void
  toggleFileTreeExpanded: (projectId: string, path: string) => void
  setFileTreeSelectedFile: (projectId: string, path: string | null) => void
  addFileTreeChangedPath: (projectId: string, path: string) => void
  removeFileTreeChangedPath: (projectId: string, path: string) => void
  updateFileTreeChildren: (projectId: string, parentPath: string, children: FileNode[]) => void

  setGitStatuses: (projectId: string, result: GitStatusDetailResult) => void
  setGitDiffStats: (projectId: string, stats: Map<string, FileDiffStat>) => void
  ensureFileTreeCache: (dirPath: string) => void
  setActiveDiff: (projectId: string, diff: DiffViewState | null) => void

  // Editor tab actions
  openFile: (projectId: string, path: string) => void
  closeFile: (projectId: string, path: string) => void
  closeOtherFiles: (projectId: string, path: string) => void

  // Diff tab actions
  openDiff: (projectId: string, diff: DiffViewState) => void
  closeDiff: (projectId: string, filePath: string) => void
  setSelectedDiff: (projectId: string, filePath: string | null) => void
}

// Priority order for folder propagation (higher index = higher priority)
const STATUS_PRIORITY: GitFileStatus[] = ['renamed', 'untracked', 'added', 'modified', 'deleted', 'conflicted']

function higherPriorityStatus(a: GitFileStatus | undefined, b: GitFileStatus): GitFileStatus {
  if (!a) return b
  return STATUS_PRIORITY.indexOf(a) >= STATUS_PRIORITY.indexOf(b) ? a : b
}

function emptyFileTreeState(): ProjectFileTreeState {
  return {
    nodes: [],
    expandedPaths: new Set(),
    selectedFilePath: null,
    openFiles: [],
    recentlyChangedPaths: new Set(),
    gitStatuses: new Map(),
    gitDetailedFiles: [],
    gitBranch: '',
    gitUpstream: null,
    gitAhead: 0,
    gitBehind: 0,
    activeDiff: null,
    openDiffs: [],
    selectedDiffPath: null,
    gitDiffStats: new Map(),
  }
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: new Map(),
  activeProjectId: null,
  projectOrder: [],
  fileTreeCache: new Map(),

  setProjectColor: async (path, color) => {
    await trpc.project.update.mutate({ id: path, patch: { color } })
  },

  setProjectIcon: async (path, icon) => {
    await trpc.project.update.mutate({ id: path, patch: { icon: icon || null } })
  },

  addProject: async (path) => {
    const { projects, projectOrder } = get()
    if (projects.has(path)) {
      set({ activeProjectId: path })
      return
    }
    const sortOrder = projectOrder.length
    const color = PROJECT_COLORS[sortOrder % PROJECT_COLORS.length]
    await trpc.project.add.mutate({
      id: path, path, name: basename(path), color, icon: null, sortOrder,
    })
    set({ activeProjectId: path })
    // Live update arrives via project:listChanged subscription.
  },

  removeProject: async (path) => {
    await trpc.project.remove.mutate({ id: path })
    trpc.file.unwatchDir.mutate({ dirPath: path }).catch(() => {})
  },

  reorderProjects: async (fromIndex, toIndex) => {
    const { projectOrder } = get()
    if (fromIndex < 0 || fromIndex >= projectOrder.length || toIndex < 0 || toIndex >= projectOrder.length) return
    if (fromIndex === toIndex) return
    const next = [...projectOrder]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    await trpc.project.reorder.mutate({ idsInOrder: next })
  },

  setActiveProject: (path) => set({ activeProjectId: path }),

  loadProjects: async () => {
    try {
      const daemonProjects = await trpc.project.list.query()
      const projects = new Map<string, Project>()
      const fileTreeCache = new Map<string, ProjectFileTreeState>()
      const projectOrder: string[] = []
      for (const dp of daemonProjects) {
        projects.set(dp.id, {
          id: dp.id,
          path: dp.path,
          name: dp.name,
          addedAt: dp.addedAt,
          color: dp.color,
          icon: dp.icon ?? undefined,
        })
        fileTreeCache.set(dp.id, emptyFileTreeState())
        projectOrder.push(dp.id)
      }
      set({
        projects,
        projectOrder,
        fileTreeCache,
        activeProjectId: projectOrder[0] ?? null,
      })
    } catch (err) {
      console.error('[projectStore] loadProjects failed:', err)
    }
  },

  refreshFromDaemon: async () => {
    try {
      const daemonProjects = await trpc.project.list.query()
      set((state) => {
        const projects = new Map<string, Project>()
        const fileTreeCache = new Map(state.fileTreeCache)
        const projectOrder: string[] = []
        for (const dp of daemonProjects) {
          projects.set(dp.id, {
            id: dp.id, path: dp.path, name: dp.name,
            addedAt: dp.addedAt, color: dp.color,
            icon: dp.icon ?? undefined,
          })
          if (!fileTreeCache.has(dp.id)) fileTreeCache.set(dp.id, emptyFileTreeState())
          projectOrder.push(dp.id)
        }
        for (const cachedId of [...fileTreeCache.keys()]) {
          if (!projects.has(cachedId)) fileTreeCache.delete(cachedId)
        }
        const activeProjectId = state.activeProjectId && projects.has(state.activeProjectId)
          ? state.activeProjectId
          : projectOrder[0] ?? null
        return { projects, projectOrder, fileTreeCache, activeProjectId }
      })
    } catch (err) {
      console.error('[projectStore] refreshFromDaemon failed:', err)
    }
  },

  // File tree cache actions
  setFileTreeNodes: (projectId, nodes) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, nodes })
      return { fileTreeCache }
    }),

  toggleFileTreeExpanded: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const expandedPaths = new Set(cache.expandedPaths)
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path)
      } else {
        expandedPaths.add(path)
      }
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, expandedPaths })
      return { fileTreeCache }
    }),

  setFileTreeSelectedFile: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, selectedFilePath: path })
      return { fileTreeCache }
    }),

  addFileTreeChangedPath: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const recentlyChangedPaths = new Set(cache.recentlyChangedPaths)
      recentlyChangedPaths.add(path)
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, recentlyChangedPaths })
      return { fileTreeCache }
    }),

  removeFileTreeChangedPath: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const recentlyChangedPaths = new Set(cache.recentlyChangedPaths)
      recentlyChangedPaths.delete(path)
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, recentlyChangedPaths })
      return { fileTreeCache }
    }),

  updateFileTreeChildren: (projectId, parentPath, children) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const updateNodes = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.path === parentPath && node.type === 'directory') {
            return { ...node, children }
          }
          if (node.children) {
            return { ...node, children: updateNodes(node.children) }
          }
          return node
        })
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, nodes: updateNodes(cache.nodes) })
      return { fileTreeCache }
    }),

  setGitStatuses: (projectId, result) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const gitStatuses = new Map<string, GitFileStatus>()
      // Set file statuses from combined status for tree coloring
      for (const file of result.files) {
        const status = file.status as GitFileStatus
        gitStatuses.set(file.absolutePath, status)
        // Propagate to parent folders up to project root
        let dir = file.absolutePath.slice(0, file.absolutePath.lastIndexOf('/'))
        while (dir.length >= projectId.length) {
          const existing = gitStatuses.get(dir)
          gitStatuses.set(dir, higherPriorityStatus(existing, status))
          const parentEnd = dir.lastIndexOf('/')
          if (parentEnd < 0) break
          dir = dir.slice(0, parentEnd)
        }
      }
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, {
        ...cache,
        gitStatuses,
        gitDetailedFiles: result.files,
        gitBranch: result.branch,
        gitUpstream: result.upstream,
        gitAhead: result.ahead,
        gitBehind: result.behind,
      })
      return { fileTreeCache }
    }),

  setGitDiffStats: (projectId, stats) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, gitDiffStats: stats })
      return { fileTreeCache }
    }),

  ensureFileTreeCache: (dirPath) =>
    set((state) => {
      if (state.fileTreeCache.has(dirPath)) return state
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(dirPath, emptyFileTreeState())
      return { fileTreeCache }
    }),

  setActiveDiff: (projectId, diff) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, activeDiff: diff })
      return { fileTreeCache }
    }),

  openFile: (projectId, path) => {
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const openFiles = cache.openFiles.includes(path)
        ? cache.openFiles
        : [...cache.openFiles, path]
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openFiles, selectedFilePath: path, selectedDiffPath: null, activeDiff: null })
      return { fileTreeCache }
    })
    useUIStore.getState().setMainPanelMode('editor')
  },

  closeFile: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const idx = cache.openFiles.indexOf(path)
      if (idx === -1) return state
      const openFiles = cache.openFiles.filter((p) => p !== path)
      let selectedFilePath = cache.selectedFilePath
      if (selectedFilePath === path) {
        // Activate adjacent tab: prefer the one after, then before, then null
        selectedFilePath = openFiles[Math.min(idx, openFiles.length - 1)] ?? null
      }
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openFiles, selectedFilePath })
      return { fileTreeCache }
    }),

  closeOtherFiles: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const openFiles = cache.openFiles.includes(path) ? [path] : []
      const selectedFilePath = openFiles.length > 0 ? path : null
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openFiles, selectedFilePath })
      return { fileTreeCache }
    }),

  openDiff: (projectId, diff) => {
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const exists = cache.openDiffs.some((d) => d.filePath === diff.filePath && d.staged === diff.staged)
      const openDiffs = exists ? cache.openDiffs : [...cache.openDiffs, diff]
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openDiffs, selectedDiffPath: diff.filePath, activeDiff: diff })
      return { fileTreeCache }
    })
    useUIStore.getState().setMainPanelMode('editor')
  },

  closeDiff: (projectId, filePath) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const idx = cache.openDiffs.findIndex((d) => d.filePath === filePath)
      if (idx === -1) return state
      const openDiffs = cache.openDiffs.filter((d) => d.filePath !== filePath)
      let selectedDiffPath = cache.selectedDiffPath
      let activeDiff = cache.activeDiff
      if (selectedDiffPath === filePath) {
        const next = openDiffs[Math.min(idx, openDiffs.length - 1)] ?? null
        selectedDiffPath = next?.filePath ?? null
        activeDiff = next
      }
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openDiffs, selectedDiffPath, activeDiff })
      return { fileTreeCache }
    }),

  setSelectedDiff: (projectId, filePath) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const diff = cache.openDiffs.find((d) => d.filePath === filePath) ?? null
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, selectedDiffPath: filePath, activeDiff: diff })
      return { fileTreeCache }
    }),
}))
