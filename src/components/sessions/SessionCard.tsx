import { memo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { trpc } from '../../trpc'
import type { Session } from '../../types'

const STATUS_CONFIG: Record<string, { label: string; cssVar: string; pulse?: boolean }> = {
  running:     { label: 'Running',     cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { label: 'Needs input', cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { label: 'Completed',   cssVar: 'var(--t-status-completed)' },
  idle:        { label: 'Idle',        cssVar: 'var(--t-status-idle)' },
  errored:     { label: 'Errored',     cssVar: 'var(--t-status-errored)' },
}

export const SessionCard = memo(function SessionCard({ session, isActive }: { session: Session; isActive: boolean }) {
  const setActive = useSessionStore((s) => s.setActiveSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.completed

  return (
    <div
      onClick={() => {
        setActive(session.id)
        setActiveProject(session.originalRepo ?? session.cwd)
      }}
      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-all ${
        isActive
          ? 'bg-[var(--t-bg-hover)] ring-1 ring-violet-500/20 cursor-pointer'
          : 'hover:bg-[var(--t-bg-active)] cursor-pointer'
      }`}
    >
      {/* Status dot */}
      <div className="mt-1.5 flex-shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: config.cssVar }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[13px] font-medium truncate ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
              {session.name}
            </span>
          </div>
          {session.hasUnread && !isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
          )}
        </div>
        <div
          className={`text-[11px] mt-0.5 truncate ${
            session.statusDetail && session.statusDetail === 'Thinking...' ? 'italic' : ''
          }`}
          style={{
            color: session.statusDetail
              ? session.statusDetail.startsWith('Needs permission')
                ? 'var(--t-status-needs-input)'
                : 'var(--t-status-completed)'
              : config.cssVar,
            opacity: session.statusDetail === 'Thinking...' ? 0.6 : undefined,
          }}
        >
          {session.statusDetail ? session.statusDetail : config.label}
        </div>
        {session.isWorktree && session.worktreeBranch && (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/20 text-violet-300">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
              </svg>
              {session.worktreeBranch}
            </span>
          </div>
        )}
      </div>

      {/* Close button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (session.status === 'running' || session.status === 'idle' || session.status === 'needs_input') trpc.session.kill.mutate({ id: session.id })
          if (session.isWorktree && session.originalRepo && session.worktreePath) {
            trpc.git.worktree.remove.mutate({ repoPath: session.originalRepo, worktreePath: session.worktreePath }).catch(() => {})
          }
          removeSession(session.id)
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity p-0.5"
        title="Close session"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
})
