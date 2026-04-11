import { useWorkspaceStore } from '../stores/workspaceStore'
import { useUIStore } from '../stores/uiStore'
import type { Workspace } from '../types'

interface ActiveWorkspaceInfo {
  dir: string | null
  branch: string | null
  isWorktree: boolean
}

/**
 * Derives the active workspace directory from `activeWorkspaceId` in the UI store.
 *
 * Navigation actions (switchProject, switchSession, switchWorkspace) keep
 * `activeWorkspaceId` in sync, so this hook just reads it directly.
 * Returns null dir when no workspace is selected (consumers fall back to activeProjectId).
 */
export function useActiveWorkspaceDir(): ActiveWorkspaceInfo {
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)

  const workspace: Workspace | null = useWorkspaceStore((s) => {
    if (!activeWorkspaceId) return null
    return s.workspaces.get(activeWorkspaceId) ?? null
  })

  if (!workspace) return { dir: null, branch: null, isWorktree: false }

  return {
    dir: workspace.worktreePath ?? workspace.projectId,
    branch: workspace.branch || null,
    isWorktree: workspace.type === 'worktree',
  }
}
