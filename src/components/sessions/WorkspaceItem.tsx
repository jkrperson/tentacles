import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { getErrorMessage } from '../../utils/errors'
import type { Workspace } from '../../types'

interface WorkspaceItemProps {
  workspace: Workspace
}

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const terminals = useTerminalStore((s) => s.terminals)
  const terminalOrder = useTerminalStore((s) => s.terminalOrder)
  const deleteWorktreeWorkspace = useWorkspaceStore((s) => s.deleteWorktreeWorkspace)
  const showConfirm = useConfirmStore((s) => s.show)

  const agentCount = useMemo(() => {
    return sessionOrder.filter((id) => sessions.get(id)?.workspaceId === workspace.id).length
  }, [sessionOrder, sessions, workspace.id])

  const hasAliveSessions = useMemo(() => {
    return sessionOrder.some((id) => {
      const s = sessions.get(id)
      return s?.workspaceId === workspace.id && (s.status === 'running' || s.status === 'idle' || s.status === 'needs_input')
    })
  }, [sessionOrder, sessions, workspace.id])

  const hasRunningTerminals = useMemo(() => {
    return terminalOrder.some((id) => {
      const t = terminals.get(id)
      return t?.workspaceId === workspace.id && t.status === 'running'
    })
  }, [terminalOrder, terminals, workspace.id])

  const canDelete = workspace.type === 'worktree' && !hasAliveSessions && !hasRunningTerminals
  const isMain = workspace.type === 'main'

  const handleDelete = () => {
    if (hasAliveSessions || hasRunningTerminals) {
      showConfirm({
        title: `Cannot delete "${workspace.name}"`,
        message: 'Close all running agents and terminals in this workspace first.',
        confirmLabel: 'OK',
        onConfirm: () => {},
      })
      return
    }
    showConfirm({
      title: `Delete workspace "${workspace.name}"?`,
      message: `This will remove the worktree branch "${workspace.branch}" from disk.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleteWorktreeWorkspace(workspace.id).catch((err) => {
          console.error('Failed to delete workspace', getErrorMessage(err))
        })
      },
    })
  }

  return (
    <div className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[var(--t-bg-active)] transition-colors">
      {/* Branch icon */}
      {isMain ? (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-600 flex-shrink-0">
          <circle cx="8" cy="8" r="3" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-600 flex-shrink-0">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
        </svg>
      )}

      {/* Name */}
      <span className="text-[11px] text-zinc-400 truncate flex-1">
        {isMain ? 'main' : workspace.name}
      </span>

      {/* Agent count */}
      {agentCount > 0 && (
        <span className="text-[9px] text-zinc-600 flex-shrink-0">{agentCount}</span>
      )}

      {/* Delete button (worktrees only) */}
      {!isMain && (
        <button
          onClick={handleDelete}
          className={`opacity-0 group-hover:opacity-100 p-0.5 transition-all ${
            canDelete ? 'text-zinc-600 hover:text-red-400' : 'text-zinc-800 cursor-not-allowed'
          }`}
          title={canDelete ? 'Delete workspace' : 'Close all agents/terminals first'}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      )}
    </div>
  )
}
