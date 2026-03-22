import { memo, useState, useRef, useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useUIStore } from '../../stores/uiStore'
import { trpc } from '../../trpc'
import { AgentIcon } from '../icons/AgentIcons'
import type { Session, AgentIconKey } from '../../types'

const STATUS_CONFIG: Record<string, { label: string; cssVar: string; pulse?: boolean }> = {
  running:     { label: 'Working...',  cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { label: 'Needs input', cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { label: 'Completed',   cssVar: 'var(--t-status-completed)' },
  idle:        { label: 'Idle',        cssVar: 'var(--t-status-idle)' },
  errored:     { label: 'Errored',     cssVar: 'var(--t-status-errored)' },
}

function AgentStatusIcon({ status, icon, cssVar }: { status: string; icon: AgentIconKey; cssVar: string }) {
  const animClass =
    status === 'running' ? 'animate-pulse' :
    status === 'needs_input' ? 'animate-pulse' :
    ''

  return (
    <span className={`flex-shrink-0 ${animClass}`} style={{ color: cssVar }}>
      <AgentIcon icon={icon} size={14} />
    </span>
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
  const renameSession = useSessionStore((s) => s.renameSession)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const agents = useSettingsStore((s) => s.settings.agents)
  const showConfirm = useConfirmStore((s) => s.show)
  const renamingSessionId = useUIStore((s) => s.renamingSessionId)
  const setRenamingSessionId = useUIStore((s) => s.setRenamingSessionId)
  const openTerminalView = useUIStore((s) => s.openTerminalView)
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.completed

  const agentConfig = agents.find((a) => a.id === session.agentType)
  const agentIcon: AgentIconKey = agentConfig?.icon ?? 'generic'

  const isRenaming = renamingSessionId === session.id
  const [renameValue, setRenameValue] = useState(session.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(session.name)
      // Focus after render
      requestAnimationFrame(() => renameInputRef.current?.select())
    }
  }, [isRenaming, session.name])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== session.name) {
      renameSession(session.id, trimmed)
    }
    setRenamingSessionId(null)
  }

  // Derive project from workspace
  const workspace = workspaces.get(session.workspaceId)
  const projectId = workspace?.projectId ?? session.cwd

  return (
    <div
      onClick={() => {
        setActive(session.id)
        setActiveProject(projectId)
        openTerminalView()
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
        dropPosition === 'above' ? 'ring-t-2 ring-[var(--t-accent)]' : ''
      } ${dropPosition === 'below' ? 'ring-b-2 ring-[var(--t-accent)]' : ''}`}
      style={dropPosition ? {
        borderTop: dropPosition === 'above' ? '2px solid rgb(139 92 246)' : undefined,
        borderBottom: dropPosition === 'below' ? '2px solid rgb(139 92 246)' : undefined,
      } : undefined}
    >
      {/* Agent logo as status icon */}
      <div className="mt-0.5 flex-shrink-0">
        <AgentStatusIcon status={session.status} icon={agentIcon} cssVar={config.cssVar} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + unread */}
        <div className="flex items-center gap-1.5">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingSessionId(null)
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-semibold text-zinc-100 bg-[var(--t-bg-base)] border border-[var(--t-border)] rounded px-1 py-0 w-full outline-none focus:border-[var(--t-accent)]"
            />
          ) : (
            <span
              className={`text-[11px] font-semibold truncate ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenamingSessionId(session.id)
              }}
            >
              {session.name}
            </span>
          )}
          {session.hasUnread && !isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-accent)] flex-shrink-0" />
          )}
        </div>
        {/* Subtitle: workspace name · status */}
        <div className="text-[10px] truncate text-zinc-500">
          {workspace ? `${workspace.name}  ·  ` : ''}{config.label}
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
