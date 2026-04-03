import { create } from 'zustand'
import type { GitPanelViewMode } from '../types'
import { useSettingsStore } from './settingsStore'

export type CenterView = 'terminal' | 'workspace' | 'projectSettings' | 'todos'
export type MainPanelMode = 'session' | 'editor'

interface UIState {
  // Center view
  centerView: CenterView
  activeWorkspaceId: string | null
  activeProjectSettingsId: string | null
  setActiveWorkspaceId: (workspaceId: string | null) => void
  openWorkspacePage: (workspaceId: string) => void
  openTerminalView: () => void
  openProjectSettingsPage: (projectId: string) => void
  openTodosPage: () => void

  // Main panel mode (within terminal center view)
  mainPanelMode: MainPanelMode
  setMainPanelMode: (mode: MainPanelMode) => void

  // Agent spawn dialog
  spawnDialogOpen: boolean
  spawnProjectId: string
  spawnPreselectedWsId: string | undefined
  openSpawnDialog: (projectId: string, preselectedWsId?: string) => void
  closeSpawnDialog: () => void

  // Worktree create dialog
  worktreeDialogOpen: boolean
  worktreeProjectId: string
  openWorktreeDialog: (projectId: string) => void
  closeWorktreeDialog: () => void

  // Right sidebar
  rightSidebarVisible: boolean
  rightSidebarTab: 'explorer' | 'git'
  setRightSidebarVisible: (visible: boolean) => void
  toggleRightSidebar: () => void
  setRightSidebarTab: (tab: 'explorer' | 'git') => void

  // Session rename
  renamingSessionId: string | null
  setRenamingSessionId: (id: string | null) => void

  // Shortcut overlay
  shortcutOverlayOpen: boolean
  setShortcutOverlayOpen: (open: boolean) => void
  toggleShortcutOverlay: () => void

  // Sidebar view mode (flat vs grouped)
  sidebarViewMode: 'flat' | 'grouped'
  setSidebarViewMode: (mode: 'flat' | 'grouped') => void
  toggleSidebarViewMode: () => void

  // Git panel view mode
  gitPanelViewMode: GitPanelViewMode
  setGitPanelViewMode: (mode: GitPanelViewMode) => void
}

export const useUIStore = create<UIState>((set) => ({
  // Center view
  centerView: 'terminal',
  activeWorkspaceId: null,
  activeProjectSettingsId: null,
  setActiveWorkspaceId: (workspaceId) =>
    set({ activeWorkspaceId: workspaceId }),
  openWorkspacePage: (workspaceId) =>
    set({ centerView: 'workspace', activeWorkspaceId: workspaceId }),
  openTerminalView: () =>
    set({ centerView: 'terminal' }),
  openProjectSettingsPage: (projectId) =>
    set({ centerView: 'projectSettings', activeProjectSettingsId: projectId }),
  openTodosPage: () =>
    set({ centerView: 'todos' }),

  // Main panel mode
  mainPanelMode: 'session',
  setMainPanelMode: (mode) => set({ mainPanelMode: mode }),

  // Agent spawn dialog
  spawnDialogOpen: false,
  spawnProjectId: '',
  spawnPreselectedWsId: undefined,
  openSpawnDialog: (projectId, preselectedWsId) =>
    set({ spawnDialogOpen: true, spawnProjectId: projectId, spawnPreselectedWsId: preselectedWsId }),
  closeSpawnDialog: () =>
    set({ spawnDialogOpen: false }),

  // Worktree create dialog
  worktreeDialogOpen: false,
  worktreeProjectId: '',
  openWorktreeDialog: (projectId) =>
    set({ worktreeDialogOpen: true, worktreeProjectId: projectId }),
  closeWorktreeDialog: () =>
    set({ worktreeDialogOpen: false }),

  // Right sidebar
  rightSidebarVisible: true,
  rightSidebarTab: 'explorer',
  setRightSidebarVisible: (visible) => set({ rightSidebarVisible: visible }),
  toggleRightSidebar: () => set((s) => ({ rightSidebarVisible: !s.rightSidebarVisible })),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),

  // Session rename
  renamingSessionId: null,
  setRenamingSessionId: (id) => set({ renamingSessionId: id }),

  // Shortcut overlay
  shortcutOverlayOpen: false,
  setShortcutOverlayOpen: (open) => set({ shortcutOverlayOpen: open }),
  toggleShortcutOverlay: () => set((s) => ({ shortcutOverlayOpen: !s.shortcutOverlayOpen })),

  // Sidebar view mode
  sidebarViewMode: 'flat',
  setSidebarViewMode: (mode) => set({ sidebarViewMode: mode }),
  toggleSidebarViewMode: () => set((s) => {
    const next = s.sidebarViewMode === 'flat' ? 'grouped' : 'flat'
    useSettingsStore.getState().saveSettings({ sidebarViewMode: next })
    return { sidebarViewMode: next }
  }),

  // Git panel view mode
  gitPanelViewMode: 'flat',
  setGitPanelViewMode: (mode) => set({ gitPanelViewMode: mode }),
}))
