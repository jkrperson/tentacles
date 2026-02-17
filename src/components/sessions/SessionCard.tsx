import { memo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Session } from '../../types'

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string }> = {
  running: { label: 'Running', dotColor: 'bg-emerald-400', textColor: 'text-emerald-400' },
  idle: { label: 'Waiting', dotColor: 'bg-amber-400', textColor: 'text-amber-400' },
  completed: { label: 'Completed', dotColor: 'bg-zinc-500', textColor: 'text-zinc-500' },
  errored: { label: 'Errored', dotColor: 'bg-red-400', textColor: 'text-red-400' },
}

export const SessionCard = memo(function SessionCard({ session, isActive, isArchived, onResume }: { session: Session; isActive: boolean; isArchived?: boolean; onResume?: () => void }) {
  const setActive = useSessionStore((s) => s.setActiveSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const deleteArchivedSession = useSessionStore((s) => s.deleteArchivedSession)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const config = isArchived
    ? { label: 'Archived', dotColor: 'bg-zinc-700', textColor: 'text-zinc-600' }
    : STATUS_CONFIG[session.status] ?? STATUS_CONFIG.completed

  return (
    <div
      onClick={() => {
        if (isArchived) return
        setActive(session.id)
        setActiveProject(session.originalRepo ?? session.cwd)
      }}
      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-all ${
        isArchived
          ? 'opacity-60'
          : isActive
            ? 'bg-[var(--t-bg-hover)] ring-1 ring-violet-500/20 cursor-pointer'
            : 'hover:bg-[var(--t-bg-active)] cursor-pointer'
      }`}
    >
      {/* Status dot */}
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${config.dotColor} ${!isArchived && session.status === 'running' ? 'animate-pulse' : ''}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[13px] font-medium truncate ${isArchived ? 'text-zinc-500' : isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
            {session.name}
          </span>
          {!isArchived && session.hasUnread && !isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
          )}
        </div>
        <div className={`text-[11px] mt-0.5 truncate ${
          !isArchived && session.statusDetail
            ? session.statusDetail.startsWith('Needs permission')
              ? 'text-amber-400'
              : session.statusDetail === 'Thinking...'
                ? 'text-emerald-400/60 italic'
                : 'text-emerald-400'
            : config.textColor
        }`}>
          {!isArchived && session.statusDetail ? session.statusDetail : config.label}
        </div>
        {session.isWorktree && session.worktreeBranch && (
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${isArchived ? 'bg-zinc-500/10 text-zinc-600' : 'bg-violet-500/20 text-violet-300'}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
              </svg>
              {session.worktreeBranch}
            </span>
          </div>
        )}
      </div>

      {/* Resume button on hover (archived cards with claudeSessionId) */}
      {isArchived && onResume && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onResume()
          }}
          className="absolute right-8 top-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-emerald-400 transition-opacity p-0.5"
          title="Resume session"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5v-11z"/>
          </svg>
        </button>
      )}

      {/* Remove / Delete button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (isArchived) {
            // Permanent delete — clean up worktree if applicable
            if (session.isWorktree && session.originalRepo && session.worktreePath) {
              window.electronAPI.git.worktree.remove(session.originalRepo, session.worktreePath).catch(() => {})
            }
            deleteArchivedSession(session.id)
          } else {
            // Archive (kill if still running)
            if (session.status === 'running' || session.status === 'idle') window.electronAPI.session.kill(session.id)
            removeSession(session.id)
          }
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity p-0.5"
        title={isArchived ? 'Delete permanently' : 'Close session'}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
})
