import { create } from 'zustand'

interface UIState {
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
}

export const useUIStore = create<UIState>((set) => ({
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
}))
