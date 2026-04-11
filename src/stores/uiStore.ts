import { create } from 'zustand'
import type { GitPanelViewMode } from '../types'
import { useSettingsStore } from './settingsStore'
import { useProjectStore } from './projectStore'
import { useSessionStore } from './sessionStore'
import { useWorkspaceStore } from './workspaceStore'
import { useTerminalStore } from './terminalStore'

export type CenterView = 'terminal' | 'workspace' | 'projectSettings' | 'todos' | 'agentChat'
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

  // --- Centralized navigation ---
  /** Switch to a project: clears session + workspace context, shows terminal */
  switchProject: (projectId: string) => void
  /** Switch to a workspace (empty, no session): sets project + workspace, shows terminal */
  switchWorkspace: (workspaceId: string) => void
  /** Switch to a session: derives project + workspace, shows terminal */
  switchSession: (sessionId: string) => void
  /** Switch to a terminal: sets project + workspace context, expands bottom panel */
  switchTerminal: (terminalId: string, workspaceId: string) => void

  // Agent chat
  previousCenterView: CenterView
  openAgentChat: () => void
  toggleAgentChat: () => void

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

  // --- Centralized navigation ---
  switchProject: (projectId) => {
    useProjectStore.getState().setActiveProject(projectId)
    useSessionStore.getState().setActiveSession(null)
    set({ activeWorkspaceId: null, centerView: 'terminal' })
  },

  switchWorkspace: (workspaceId) => {
    const workspace = useWorkspaceStore.getState().workspaces.get(workspaceId)
    if (!workspace) return
    useProjectStore.getState().setActiveProject(workspace.projectId)
    useSessionStore.getState().setActiveSession(null)
    set({ activeWorkspaceId: workspaceId, centerView: 'terminal' })
  },

  switchSession: (sessionId) => {
    const session = useSessionStore.getState().sessions.get(sessionId)
    if (!session) return
    const workspace = useWorkspaceStore.getState().workspaces.get(session.workspaceId)
    useSessionStore.getState().setActiveSession(sessionId)
    if (workspace) {
      useProjectStore.getState().setActiveProject(workspace.projectId)
    }
    set({ activeWorkspaceId: session.workspaceId, centerView: 'terminal' })
  },

  switchTerminal: (terminalId, workspaceId) => {
    const workspace = useWorkspaceStore.getState().workspaces.get(workspaceId)
    if (!workspace) return
    useTerminalStore.getState().setActiveTerminal(terminalId)
    useTerminalStore.getState().setBottomPanelExpanded(true)
    useProjectStore.getState().setActiveProject(workspace.projectId)
    set({ activeWorkspaceId: workspaceId, centerView: 'terminal' })
  },

  // Agent chat
  previousCenterView: 'terminal',
  openAgentChat: () =>
    set((s) => ({
      previousCenterView: s.centerView !== 'agentChat' ? s.centerView : s.previousCenterView,
      centerView: 'agentChat',
    })),
  toggleAgentChat: () =>
    set((s) => {
      if (s.centerView === 'agentChat') {
        return { centerView: s.previousCenterView }
      }
      return { previousCenterView: s.centerView, centerView: 'agentChat' }
    }),

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
