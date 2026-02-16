import { create } from 'zustand'
import type { Project, ProjectFileTreeState, FileNode } from '../types'
import { useSettingsStore } from './settingsStore'

interface ProjectState {
  projects: Map<string, Project>
  activeProjectId: string | null
  projectOrder: string[]
  fileTreeCache: Map<string, ProjectFileTreeState>

  addProject: (path: string) => void
  removeProject: (path: string) => void
  setActiveProject: (path: string | null) => void
  loadProjects: () => void
  persistProjects: () => void

  // File tree cache actions
  setFileTreeNodes: (projectId: string, nodes: FileNode[]) => void
  toggleFileTreeExpanded: (projectId: string, path: string) => void
  setFileTreeSelectedFile: (projectId: string, path: string | null) => void
  addFileTreeChangedPath: (projectId: string, path: string) => void
  removeFileTreeChangedPath: (projectId: string, path: string) => void
  updateFileTreeChildren: (projectId: string, parentPath: string, children: FileNode[]) => void

  // Editor tab actions
  openFile: (projectId: string, path: string) => void
  closeFile: (projectId: string, path: string) => void
  closeOtherFiles: (projectId: string, path: string) => void
}

function emptyFileTreeState(): ProjectFileTreeState {
  return {
    nodes: [],
    expandedPaths: new Set(),
    selectedFilePath: null,
    openFiles: [],
    recentlyChangedPaths: new Set(),
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

  addProject: (path) => {
    const state = get()
    if (state.projects.has(path)) {
      // Already exists, just activate
      set({ activeProjectId: path })
      return
    }
    const projects = new Map(state.projects)
    projects.set(path, {
      id: path,
      path,
      name: basename(path),
      addedAt: Date.now(),
    })
    const fileTreeCache = new Map(state.fileTreeCache)
    fileTreeCache.set(path, emptyFileTreeState())
    set({
      projects,
      projectOrder: [...state.projectOrder, path],
      activeProjectId: path,
      fileTreeCache,
    })
    get().persistProjects()
  },

  removeProject: (path) => {
    const state = get()
    const projects = new Map(state.projects)
    projects.delete(path)
    const projectOrder = state.projectOrder.filter((p) => p !== path)
    const fileTreeCache = new Map(state.fileTreeCache)
    fileTreeCache.delete(path)
    const activeProjectId =
      state.activeProjectId === path
        ? projectOrder[0] ?? null
        : state.activeProjectId
    set({ projects, projectOrder, activeProjectId, fileTreeCache })
    window.electronAPI.file.unwatchDir(path).catch(() => {})
    get().persistProjects()
  },

  setActiveProject: (path) => set({ activeProjectId: path }),

  loadProjects: () => {
    const settings = useSettingsStore.getState().settings
    const paths = settings.projectPaths?.length
      ? settings.projectPaths
      : settings.defaultProjectPath
        ? [settings.defaultProjectPath]
        : []

    const projects = new Map<string, Project>()
    const fileTreeCache = new Map<string, ProjectFileTreeState>()
    const projectOrder: string[] = []

    for (const p of paths) {
      projects.set(p, { id: p, path: p, name: basename(p), addedAt: Date.now() })
      fileTreeCache.set(p, emptyFileTreeState())
      projectOrder.push(p)
    }

    set({
      projects,
      projectOrder,
      fileTreeCache,
      activeProjectId: projectOrder[0] ?? null,
    })
  },

  persistProjects: () => {
    const { projectOrder } = get()
    useSettingsStore.getState().saveSettings({ projectPaths: projectOrder })
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

  openFile: (projectId, path) =>
    set((state) => {
      const cache = state.fileTreeCache.get(projectId)
      if (!cache) return state
      const openFiles = cache.openFiles.includes(path)
        ? cache.openFiles
        : [...cache.openFiles, path]
      const fileTreeCache = new Map(state.fileTreeCache)
      fileTreeCache.set(projectId, { ...cache, openFiles, selectedFilePath: path })
      return { fileTreeCache }
    }),

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
}))
