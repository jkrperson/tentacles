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

export const SessionCard = memo(function SessionCard({ session, isActive }: { session: Session; isActive: boolean }) {
  const setActive = useSessionStore((s) => s.setActiveSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.completed

  return (
    <div
      onClick={() => { setActive(session.id); setActiveProject(session.cwd) }}
      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
        isActive
          ? 'bg-[var(--t-bg-hover)] ring-1 ring-violet-500/20'
          : 'hover:bg-[var(--t-bg-active)]'
      }`}
    >
      {/* Status dot */}
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${config.dotColor} ${session.status === 'running' ? 'animate-pulse' : ''}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[13px] font-medium truncate ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
            {session.name}
          </span>
          {session.hasUnread && !isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
          )}
        </div>
        <div className={`text-[11px] mt-0.5 ${config.textColor}`}>{config.label}</div>
      </div>

      {/* Remove button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (session.status === 'running' || session.status === 'idle') window.electronAPI.session.kill(session.id)
          removeSession(session.id)
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity p-0.5"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
})
