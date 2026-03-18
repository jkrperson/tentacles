import { memo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { trpc } from '../../trpc'
import type { Session } from '../../types'

const STATUS_CONFIG: Record<string, { label: string; cssVar: string; pulse?: boolean }> = {
  running:     { label: 'Working...',  cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { label: 'Needs input', cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { label: 'Completed',   cssVar: 'var(--t-status-completed)' },
  idle:        { label: 'Idle',        cssVar: 'var(--t-status-idle)' },
  errored:     { label: 'Errored',     cssVar: 'var(--t-status-errored)' },
}

function StatusIcon({ status, cssVar }: { status: string; cssVar: string }) {
  const size = 14
  if (status === 'needs_input') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-shrink-0" style={{ color: cssVar }}>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="4" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
    )
  }
  if (status === 'running') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-shrink-0 animate-spin" style={{ color: cssVar }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'errored') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-shrink-0" style={{ color: cssVar }}>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'completed') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-shrink-0" style={{ color: cssVar }}>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="flex-shrink-0" style={{ color: cssVar }}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

interface SessionCardProps {
  session: Session
  isActive: boolean
  draggable?: boolean
  isDragging?: boolean
  dropPosition?: 'above' | 'below' | null
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

export const SessionCard = memo(function SessionCard({
  session, isActive, draggable, isDragging, dropPosition, onDragStart, onDragOver, onDragEnd, onDrop,
}: SessionCardProps) {
  const setActive = useSessionStore((s) => s.setActiveSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const showConfirm = useConfirmStore((s) => s.show)
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.completed

  // Derive project from workspace
  const workspace = workspaces.get(session.workspaceId)
  const projectId = workspace?.projectId ?? session.cwd

  return (
    <div
      onClick={() => {
        setActive(session.id)
        setActiveProject(projectId)
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`group relative flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-all ${
        isActive
          ? 'bg-[var(--t-bg-hover)]'
          : 'hover:bg-[var(--t-bg-active)]'
      } ${isDragging ? 'opacity-40' : ''} ${
        dropPosition === 'above' ? 'ring-t-2 ring-violet-500' : ''
      } ${dropPosition === 'below' ? 'ring-b-2 ring-violet-500' : ''}`}
      style={dropPosition ? {
        borderTop: dropPosition === 'above' ? '2px solid rgb(139 92 246)' : undefined,
        borderBottom: dropPosition === 'below' ? '2px solid rgb(139 92 246)' : undefined,
      } : undefined}
    >
      {/* Status icon */}
      <div className="mt-0.5 flex-shrink-0">
        <StatusIcon status={session.status} cssVar={config.cssVar} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + unread */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold truncate ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
            {session.name}
          </span>
          {session.hasUnread && !isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
          )}
        </div>
        {/* Subtitle: workspace name · status */}
        <div className="text-[10px] truncate text-zinc-500">
          {workspace && workspace.type !== 'main' ? `${workspace.name}  ·  ` : ''}{config.label}
        </div>
      </div>

      {/* Close button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          const isAlive = session.status === 'running' || session.status === 'idle' || session.status === 'needs_input'
          const doClose = () => {
            if (isAlive) trpc.session.kill.mutate({ id: session.id })
            // Workspace lifecycle is independent — don't remove worktree on session close
            removeSession(session.id)
          }
          if (isAlive) {
            showConfirm({
              title: `Close ${session.name}?`,
              message: 'This agent is still active. Closing it will kill the running process.',
              confirmLabel: 'Close',
              onConfirm: doClose,
            })
          } else {
            doClose()
          }
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity p-0.5"
        title="Close session"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
})
