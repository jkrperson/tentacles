import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { trpc } from '../../trpc'
import { getErrorMessage } from '../../utils/errors'
import { AgentIcon } from '../icons/AgentIcons'
import type { Workspace, Session, AgentIconKey } from '../../types'

// --- Status colors applied to the agent icon itself ---
const STATUS_COLOR: Record<string, { cssVar: string; pulse?: boolean }> = {
  running:     { cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { cssVar: 'var(--t-status-completed)' },
  idle:        { cssVar: 'var(--t-status-idle)' },
  errored:     { cssVar: 'var(--t-status-errored)' },
}

// --- Compact agent row for nesting inside workspace cards ---
function CompactAgentRow({ session, isActive, onClick, onClose }: {
  session: Session
  isActive: boolean
  onClick: () => void
  onClose: (sessionId: string) => void
}) {
  const agents = useSettingsStore((s) => s.settings.agents)
  const agentConfig = agents.find((a) => a.id === session.agentType)
  const agentIcon: AgentIconKey = agentConfig?.icon ?? 'generic'
  const status = STATUS_COLOR[session.status] ?? STATUS_COLOR.completed

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`group/agent flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors cursor-pointer ${
        isActive
          ? 'bg-white/[0.06]'
          : 'hover:bg-white/[0.03]'
      }`}
    >
      {/* Agent icon colored by status */}
      <span
        className={`flex-shrink-0 ${status.pulse ? 'animate-pulse' : ''}`}
        style={{ color: status.cssVar }}
      >
        <AgentIcon icon={agentIcon} size={14} />
      </span>
      {/* Name */}
      <span className={`text-[12px] truncate flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
        {session.name}
      </span>
      {/* Unread indicator — hidden when close button shows */}
      {session.hasUnread && !isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-accent)] flex-shrink-0 group-hover/agent:hidden" />
      )}
      {/* Close button — hover reveal */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(session.id) }}
        className="opacity-60 group-hover/agent:opacity-100 p-1 text-zinc-600 hover:text-zinc-300 transition-opacity flex-shrink-0"
        title="Close agent"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
}

// --- Main workspace card ---
interface WorkspaceItemProps {
  workspace: Workspace
  onSpawnAgent: (workspaceId: string, name?: string) => void
  showNameInput?: boolean
  onCancelSpawn?: () => void
  onRequestSpawnInput?: (workspaceId: string) => void
  draggable?: boolean
  isDragging?: boolean
  dropPosition?: 'above' | 'below' | null
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

export function WorkspaceItem({
  workspace, onSpawnAgent, showNameInput, onCancelSpawn, onRequestSpawnInput, draggable, isDragging, dropPosition, onDragStart, onDragOver, onDragEnd, onDrop,
}: WorkspaceItemProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const removeSession = useSessionStore((s) => s.removeSession)
  const switchSession = useUIStore((s) => s.switchSession)
  const switchWorkspace = useUIStore((s) => s.switchWorkspace)
  const switchTerminal = useUIStore((s) => s.switchTerminal)
  const terminals = useTerminalStore((s) => s.terminals)
  const terminalOrder = useTerminalStore((s) => s.terminalOrder)
  const deleteWorktreeWorkspace = useWorkspaceStore((s) => s.deleteWorktreeWorkspace)
  const showConfirm = useConfirmStore((s) => s.show)

  const isMain = workspace.type === 'main'
  const isTearingDown = workspace.status === 'tearing_down'

  const wsSessionIds = useMemo(() => {
    return sessionOrder.filter((id) => sessions.get(id)?.workspaceId === workspace.id)
  }, [sessionOrder, sessions, workspace.id])

  const wsSessions = useMemo(() => {
    return wsSessionIds.map((id) => sessions.get(id)!).filter(Boolean)
  }, [wsSessionIds, sessions])

  const explicitActiveWsId = useUIStore((s) => s.activeWorkspaceId)
  const hasActiveAgent = useMemo(() => {
    return wsSessionIds.includes(activeSessionId ?? '')
  }, [wsSessionIds, activeSessionId])
  // Workspace is active if it has an active agent OR is explicitly selected (empty workspace click)
  const isActiveWorkspace = hasActiveAgent || explicitActiveWsId === workspace.id

  const hasAliveSessions = useMemo(() => {
    return wsSessions.some((s) =>
      s.status === 'running' || s.status === 'idle' || s.status === 'needs_input'
    )
  }, [wsSessions])

  const wsTerminalIds = useMemo(() => {
    return terminalOrder.filter((id) => {
      const t = terminals.get(id)
      return t?.workspaceId === workspace.id
    })
  }, [terminalOrder, terminals, workspace.id])

  const hasRunningTerminals = useMemo(() => {
    return wsTerminalIds.some((id) => {
      const t = terminals.get(id)
      return t?.status === 'running'
    })
  }, [wsTerminalIds, terminals])

  const canDelete = !isMain && !hasAliveSessions && !hasRunningTerminals

  // Git diff stats
  const [diffStats, setDiffStats] = useState<{ insertions: number; deletions: number } | null>(null)
  const dirPath = workspace.worktreePath ?? workspace.projectId
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchDiffStats = useCallback(() => {
    trpc.git.diffStats.query({ dirPath }).then(setDiffStats).catch(() => {})
  }, [dirPath])

  useEffect(() => {
    fetchDiffStats()
    intervalRef.current = setInterval(fetchDiffStats, 10000)
    return () => clearInterval(intervalRef.current)
  }, [fetchDiffStats])

  const handleDelete = useCallback(() => {
    if (hasAliveSessions || hasRunningTerminals) {
      showConfirm({
        title: `Cannot delete "${workspace.name}"`,
        message: 'Close all running agents and terminals first.',
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
  }, [hasAliveSessions, hasRunningTerminals, workspace, showConfirm, deleteWorktreeWorkspace])

  const handleAgentClick = useCallback((sessionId: string) => {
    switchSession(sessionId)
  }, [switchSession])

  const handleCloseAgent = useCallback((sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) return
    const isAlive = session.status === 'running' || session.status === 'idle' || session.status === 'needs_input'
    const doClose = () => {
      trpc.session.kill.mutate({ id: sessionId })
      removeSession(sessionId)
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
  }, [sessions, removeSession, showConfirm])

  const handleCardClick = useCallback(() => {
    if (wsSessionIds.length > 0) {
      handleAgentClick(wsSessionIds[0])
    } else {
      // Empty workspace — set workspace as active context for file tree/git panel
      switchWorkspace(workspace.id)
    }
  }, [wsSessionIds, handleAgentClick, switchWorkspace, workspace.id])

  const hasDiff = diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0)

  const [agentsCollapsed, setAgentsCollapsed] = useState(false)
  const [terminalsCollapsed, setTerminalsCollapsed] = useState(false)

  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)
  const removeTerminal = useTerminalStore((s) => s.removeTerminal)

  const handleTerminalClick = useCallback((terminalId: string) => {
    switchTerminal(terminalId, workspace.id)
  }, [switchTerminal, workspace.id])

  const handleCloseTerminal = useCallback((terminalId: string) => {
    const t = terminals.get(terminalId)
    if (t?.status === 'running') trpc.terminal.kill.mutate({ id: terminalId })
    removeTerminal(terminalId)
  }, [terminals, removeTerminal])

  // Inline agent name input
  const [newAgentName, setNewAgentName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNameInput) {
      setNewAgentName('')
      setTimeout(() => nameInputRef.current?.focus(), 0)
    }
  }, [showNameInput])

  const handleConfirmSpawn = useCallback(() => {
    onSpawnAgent(workspace.id, newAgentName.trim() || undefined)
    setNewAgentName('')
  }, [workspace.id, onSpawnAgent, newAgentName])

  return (
    <div
      onClick={isTearingDown ? undefined : handleCardClick}
      draggable={isTearingDown ? false : draggable}
      onDragStart={isTearingDown ? undefined : onDragStart}
      onDragOver={isTearingDown ? undefined : onDragOver}
      onDragEnd={isTearingDown ? undefined : onDragEnd}
      onDrop={isTearingDown ? undefined : onDrop}
      className={`group relative transition-[opacity] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] ${
        isTearingDown ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
      style={dropPosition ? {
        borderTop: dropPosition === 'above' ? '2px solid var(--t-accent)' : undefined,
        borderBottom: dropPosition === 'below' ? '2px solid var(--t-accent)' : undefined,
      } : undefined}
    >
      {/* Card — border only on active or hover, transparent otherwise */}
      <div
        className={`relative overflow-hidden border transition-[background-color,border-color] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] ${
          isActiveWorkspace
            ? 'border-[var(--t-accent)]/30 bg-[var(--t-accent)]/[0.04]'
            : 'border-transparent hover:border-[var(--t-hairline-strong)] hover:bg-[var(--t-bg-elevated)]'
        }`}
      >
        <div className="px-3">
          {/* Header row */}
          <div className="flex items-center gap-2 py-2.5">
            {/* Branch icon */}
            {isMain ? (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-500 flex-shrink-0">
                <circle cx="8" cy="8" r="3" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--t-accent)] flex-shrink-0">
                <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
              </svg>
            )}

            {/* Name + metadata */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[12px] font-semibold truncate ${
                  isTearingDown ? 'text-zinc-600' : isActiveWorkspace ? 'text-zinc-100' : 'text-zinc-300'
                }`}>
                  {isMain ? 'main' : workspace.name}
                </span>
                {isTearingDown && (
                  <span className="text-[9px] text-zinc-600 italic flex-shrink-0">Removing...</span>
                )}
                {!isTearingDown && hasDiff && (
                  <span className="flex items-center gap-0.5 font-mono tnum text-[9px] flex-shrink-0">
                    {diffStats!.insertions > 0 && (
                      <span className="text-[var(--t-git-added)]">+{diffStats!.insertions}</span>
                    )}
                    {diffStats!.deletions > 0 && (
                      <span className="text-[var(--t-git-deleted)]">-{diffStats!.deletions}</span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Actions — hover reveal */}
            <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onRequestSpawnInput?.(workspace.id) }}
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Add agent"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                </svg>
              </button>
              {!isMain && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete() }}
                  className={`p-0.5 transition-colors ${
                    canDelete ? 'text-zinc-600 hover:text-red-400' : 'text-zinc-800 cursor-not-allowed'
                  }`}
                  title={canDelete ? 'Delete workspace' : 'Close agents/terminals first'}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Agent list — collapsible */}
          {wsSessions.length > 0 && (
            <div className="pb-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setAgentsCollapsed(!agentsCollapsed) }}
                className="flex items-center gap-1 px-0.5 mb-0.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <svg
                  width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                  className={`transition-transform duration-150 ${agentsCollapsed ? '' : 'rotate-90'}`}
                >
                  <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
                </svg>
                {wsSessions.length} agent{wsSessions.length !== 1 ? 's' : ''}
              </button>
              {!agentsCollapsed && (
                <div className="-mx-0.5">
                  {wsSessions.map((session) => (
                    <CompactAgentRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      onClick={() => handleAgentClick(session.id)}
                      onClose={handleCloseAgent}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Terminal list — collapsible */}
          {wsTerminalIds.length > 0 && (
            <div className="pb-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setTerminalsCollapsed(!terminalsCollapsed) }}
                className="flex items-center gap-1 px-0.5 mb-0.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <svg
                  width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                  className={`transition-transform duration-150 ${terminalsCollapsed ? '' : 'rotate-90'}`}
                >
                  <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
                </svg>
                {wsTerminalIds.length} terminal{wsTerminalIds.length !== 1 ? 's' : ''}
              </button>
              {!terminalsCollapsed && (
                <div className="-mx-0.5">
                  {wsTerminalIds.map((id) => {
                    const t = terminals.get(id)
                    if (!t) return null
                    const isActive = id === activeTerminalId
                    return (
                      <div
                        key={id}
                        onClick={(e) => { e.stopPropagation(); handleTerminalClick(id) }}
                        className={`group/terminal flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-white/[0.06]'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Terminal prompt icon */}
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                          className={`flex-shrink-0 ${t.status === 'running' ? 'text-zinc-400' : 'text-zinc-600'}`}
                        >
                          <path d="M4 12l4-4-4-4" />
                        </svg>
                        {/* Name */}
                        <span className={`text-[12px] truncate flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {t.name}
                        </span>
                        {/* Exited indicator */}
                        {t.status === 'exited' && (
                          <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0 group-hover/terminal:hidden" />
                        )}
                        {/* Close button — hover reveal */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCloseTerminal(id) }}
                          className="opacity-60 group-hover/terminal:opacity-100 p-1 text-zinc-600 hover:text-zinc-300 transition-opacity flex-shrink-0"
                          title="Close terminal"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inline agent name input */}
          {showNameInput && (
            <div className="pb-2" onClick={(e) => e.stopPropagation()}>
              <input
                ref={nameInputRef}
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmSpawn()
                  if (e.key === 'Escape') onCancelSpawn?.()
                }}
                onBlur={() => setTimeout(() => onCancelSpawn?.(), 150)}
                placeholder="Agent name (enter to spawn)"
                className="w-full px-2.5 py-1.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border)] text-[var(--t-text-primary)] placeholder-[var(--t-text-faint)] outline-none focus:border-[var(--t-accent)]/50"
              />
            </div>
          )}

          {/* Empty state for worktrees with no agents */}
          {wsSessions.length === 0 && !isMain && !showNameInput && (
            <div className="pb-2">
              <button
                onClick={(e) => { e.stopPropagation(); onRequestSpawnInput?.(workspace.id) }}
                className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                </svg>
                Add agent
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
