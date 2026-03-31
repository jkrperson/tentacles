import { useSessionStore } from '../stores/sessionStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useUIStore } from '../stores/uiStore'
import type { Workspace } from '../types'

interface ActiveWorkspaceInfo {
  dir: string | null
  branch: string | null
  isWorktree: boolean
}

/**
 * Derives the active workspace directory.
 *
 * Priority:
 * 1. Active session's workspace (when an agent is selected)
 * 2. Explicitly set activeWorkspaceId in UI store (when an empty workspace is clicked)
 * 3. null (falls back to activeProjectId in consumers)
 */
export function useActiveWorkspaceDir(): ActiveWorkspaceInfo {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessionWorkspaceId = useSessionStore((s) => {
    if (!activeSessionId) return null
    const session = s.sessions.get(activeSessionId)
    return session?.workspaceId ?? null
  })
  const explicitWorkspaceId = useUIStore((s) => s.activeWorkspaceId)

  // Session workspace takes priority, then explicit UI selection
  const resolvedId = sessionWorkspaceId ?? explicitWorkspaceId

  const workspace: Workspace | null = useWorkspaceStore((s) => {
    if (!resolvedId) return null
    return s.workspaces.get(resolvedId) ?? null
  })

  if (!workspace) return { dir: null, branch: null, isWorktree: false }

  return {
    dir: workspace.worktreePath ?? workspace.projectId,
    branch: workspace.branch || null,
    isWorktree: workspace.type === 'worktree',
  }
}
