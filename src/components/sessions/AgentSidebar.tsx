import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useUIStore } from '../../stores/uiStore'
import { trpc } from '../../trpc'
import { WorkspaceItem } from './WorkspaceItem'
import { AgentSpawnDialog } from './AgentSpawnDialog'
import { WorktreeCreateDialog } from './WorktreeCreateDialog'
import { AgentIcon } from '../icons/AgentIcons'
import type { AgentConfig } from '../../types'

export function AgentSidebar() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const createSessionInWorkspace = useSessionStore((s) => s.createSessionInWorkspace)
  const agents = useSettingsStore((s) => s.settings.agents)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const addProject = useProjectStore((s) => s.addProject)
  const ensureMainWorkspace = useWorkspaceStore((s) => s.ensureMainWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const getProjectWorkspaces = useWorkspaceStore((s) => s.getProjectWorkspaces)
  const reorderWorkspaces = useWorkspaceStore((s) => s.reorderWorkspaces)
  const openProjectSettingsPage = useUIStore((s) => s.openProjectSettingsPage)

  const spawnDialogOpen = useUIStore((s) => s.spawnDialogOpen)
  const spawnProjectId = useUIStore((s) => s.spawnProjectId)
  const spawnPreselectedWsId = useUIStore((s) => s.spawnPreselectedWsId)
  const openSpawnDialog = useUIStore((s) => s.openSpawnDialog)
  const closeSpawnDialog = useUIStore((s) => s.closeSpawnDialog)
  const worktreeDialogOpen = useUIStore((s) => s.worktreeDialogOpen)
  const worktreeProjectId = useUIStore((s) => s.worktreeProjectId)
  const openWorktreeDialog = useUIStore((s) => s.openWorktreeDialog)
  const closeWorktreeDialog = useUIStore((s) => s.closeWorktreeDialog)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const moreDropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  const pinnedAgents = agents.filter((a) => a.enabled && a.pinned)
  const unpinnedAgents = agents.filter((a) => a.enabled && !a.pinned)

  // Active project info
  const activeProject = activeProjectId ? projects.get(activeProjectId) : null

  // Workspaces for active project
  const projectWorkspaces = useMemo(() => {
    if (!activeProjectId) return []
    return getProjectWorkspaces(activeProjectId)
  }, [getProjectWorkspaces, activeProjectId, workspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const worktrees = useMemo(() => {
    return projectWorkspaces.filter((ws) => ws.type !== 'main')
  }, [projectWorkspaces])

  // Workspace drag-and-drop
  const [draggedWsIndex, setDraggedWsIndex] = useState<number | null>(null)
  const [dropTargetWsIndex, setDropTargetWsIndex] = useState<number | null>(null)
  const [wsDropPosition, setWsDropPosition] = useState<'above' | 'below' | null>(null)

  // Track which workspace is showing the name input
  const [spawnTargetWsId, setSpawnTargetWsId] = useState<string | null>(null)

  // Close "more" dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (moreBtnRef.current?.contains(target)) return
      if (moreDropdownRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])

  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)

  // Spawn agent into the active workspace (derived from active session or explicit selection),
  // falling back to main workspace of active project
  const spawnAgent = useCallback(async (agentId: string) => {
    const activeSession = activeSessionId ? sessions.get(activeSessionId) : null
    const activeWsId = activeSession?.workspaceId ?? activeWorkspaceId ?? null
    const activeWs = activeWsId ? workspaces.get(activeWsId) : null

    if (activeWs) {
      createSessionInWorkspace(activeWs.id, undefined, agentId)
    } else if (activeProjectId) {
      const ws = ensureMainWorkspace(activeProjectId)
      createSessionInWorkspace(ws.id, undefined, agentId)
    } else {
      const dir = await trpc.dialog.selectDirectory.query()
      if (!dir) return
      addProject(dir)
      const ws = ensureMainWorkspace(dir)
      createSessionInWorkspace(ws.id, undefined, agentId)
    }
    setMoreOpen(false)
  }, [activeSessionId, sessions, workspaces, activeWorkspaceId, activeProjectId, ensureMainWorkspace, createSessionInWorkspace, addProject])

  const handleSpawnAgent = useCallback((workspaceId: string, name?: string) => {
    createSessionInWorkspace(workspaceId, name)
  }, [createSessionInWorkspace])

  const handleNewWorkspace = useCallback(() => {
    if (activeProjectId) openWorktreeDialog(activeProjectId)
  }, [activeProjectId, openWorktreeDialog])

  const handleSpawnInWorkspace = useCallback((workspaceId: string) => {
    setSpawnTargetWsId(workspaceId)
  }, [])

  const handleCancelSpawn = useCallback(() => {
    setSpawnTargetWsId(null)
  }, [])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Top section — Agent spawn icons */}
      <div className="px-2 pt-2.5 pb-1.5 flex-shrink-0 space-y-1">
        <div className="flex items-stretch gap-1">
          {pinnedAgents.map((agent) => (
            <AgentButton key={agent.id} agent={agent} onClick={() => spawnAgent(agent.id)} />
          ))}
          {/* More dropdown */}
          {(unpinnedAgents.length > 0 || activeProjectId) && (
            <div>
              <button
                ref={moreBtnRef}
                onClick={() => {
                  if (!moreOpen && moreBtnRef.current) {
                    const rect = moreBtnRef.current.getBoundingClientRect()
                    setDropdownPos({ top: rect.bottom + 4, left: rect.left })
                  }
                  setMoreOpen(!moreOpen)
                }}
                className="flex items-center justify-center text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] bg-[var(--t-bg-elevated)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] px-2 py-1.5 transition-all active:scale-[0.95] h-full"
                title="More agents"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.427 6.427a.75.75 0 0 1 1.06-.073L8 8.578l2.513-2.224a.75.75 0 1 1 .994 1.125l-3 2.654a.75.75 0 0 1-.994 0l-3-2.654a.75.75 0 0 1-.086-1.052z"/>
                </svg>
              </button>
              {moreOpen && createPortal(
                <div
                  ref={moreDropdownRef}
                  className="fixed w-48 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-md shadow-xl z-[9999] py-1"
                  style={{ top: dropdownPos.top, left: dropdownPos.left }}
                >
                  {unpinnedAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => spawnAgent(agent.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] transition-colors"
                    >
                      <AgentIcon icon={agent.icon} size={14} />
                      {agent.name}
                    </button>
                  ))}
                  {unpinnedAgents.length > 0 && activeProjectId && (
                    <div className="mx-2 my-1 border-t border-[var(--t-border)]" />
                  )}
                  {activeProjectId && (
                    <button
                      onClick={() => {
                        setMoreOpen(false)
                        openSpawnDialog(activeProjectId)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z"/>
                      </svg>
                      Advanced...
                    </button>
                  )}
                </div>,
                document.body,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-[var(--t-border)] mb-0.5" />

      {/* Active project header */}
      {activeProject && (
        <div className="px-2 py-1.5 flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] font-bold text-zinc-200 truncate flex-1" title={activeProject.path}>
            {activeProject.name}
          </span>
          <button
            onClick={() => openProjectSettingsPage(activeProject.id)}
            className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
            title="Project settings"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.068.727c.243-.97 1.62-.97 1.864 0l.071.286a.96.96 0 001.622.434l.205-.211c.695-.719 1.888-.03 1.613.929l-.084.293a.96.96 0 001.187 1.187l.293-.084c.96-.275 1.648.918.929 1.613l-.211.205a.96.96 0 00.434 1.622l.286.071c.97.243.97 1.62 0 1.864l-.286.071a.96.96 0 00-.434 1.622l.211.205c.719.695.03 1.888-.929 1.613l-.293-.084a.96.96 0 00-1.187 1.187l.084.293c.275.96-.918 1.648-1.613.929l-.205-.211a.96.96 0 00-1.622.434l-.071.286c-.243.97-1.62.97-1.864 0l-.071-.286a.96.96 0 00-1.622-.434l-.205.211c-.695.719-1.888.03-1.613-.929l.084-.293a.96.96 0 00-1.187-1.187l-.293.084c-.96.275-1.648-.918-.929-1.613l.211-.205a.96.96 0 00-.434-1.622l-.286-.071c-.97-.243-.97-1.62 0-1.864l.286-.071a.96.96 0 00.434-1.622l-.211-.205c-.719-.695-.03-1.888.929-1.613l.293.084A.96.96 0 005.17 2.03l-.084-.293c-.275-.96.918-1.648 1.613-.929l.205.211a.96.96 0 001.622-.434l.071-.286zM8 11a3 3 0 100-6 3 3 0 000 6z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Workspace list for active project */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {activeProject ? (
          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
            {projectWorkspaces.map((ws) => {
              const wtIdx = ws.type !== 'main' ? worktrees.indexOf(ws) : -1
              return (
                <WorkspaceItem
                  key={ws.id}
                  workspace={ws}
                  onSpawnAgent={handleSpawnAgent}
                  showNameInput={spawnTargetWsId === ws.id}
                  onCancelSpawn={handleCancelSpawn}
                  onRequestSpawnInput={handleSpawnInWorkspace}
                  draggable={ws.type !== 'main'}
                  isDragging={ws.type !== 'main' && draggedWsIndex === wtIdx}
                  dropPosition={ws.type !== 'main' && dropTargetWsIndex === wtIdx ? wsDropPosition : null}
                  onDragStart={ws.type !== 'main' ? (e) => {
                    setDraggedWsIndex(wtIdx)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('application/x-workspace', ws.id)
                  } : undefined}
                  onDragOver={ws.type !== 'main' ? (e) => {
                    if (!e.dataTransfer.types.includes('application/x-workspace')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const rect = e.currentTarget.getBoundingClientRect()
                    const midY = rect.top + rect.height / 2
                    setDropTargetWsIndex(wtIdx)
                    setWsDropPosition(e.clientY < midY ? 'above' : 'below')
                  } : undefined}
                  onDrop={ws.type !== 'main' ? (e) => {
                    e.preventDefault()
                    if (draggedWsIndex == null || dropTargetWsIndex == null) return
                    let toIdx = wsDropPosition === 'below' ? dropTargetWsIndex + 1 : dropTargetWsIndex
                    if (draggedWsIndex < toIdx) toIdx -= 1
                    reorderWorkspaces(draggedWsIndex, toIdx, activeProjectId!)
                    setDraggedWsIndex(null)
                    setDropTargetWsIndex(null)
                    setWsDropPosition(null)
                  } : undefined}
                  onDragEnd={ws.type !== 'main' ? () => {
                    setDraggedWsIndex(null)
                    setDropTargetWsIndex(null)
                    setWsDropPosition(null)
                  } : undefined}
                />
              )
            })}

            {/* New workspace button */}
            <button
              onClick={handleNewWorkspace}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] rounded transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
              </svg>
              New workspace
            </button>
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[12px] mb-1">No project selected</div>
            <div className="text-zinc-700 text-[11px]">
              Add a project from the rail to get started
            </div>
          </div>
        )}
      </div>

      {/* Spawn dialog — portalled to body to escape overflow-hidden parents */}
      {spawnDialogOpen && spawnProjectId && createPortal(
        <AgentSpawnDialog
          projectId={spawnProjectId}
          isOpen={spawnDialogOpen}
          onClose={closeSpawnDialog}
          preselectedWorkspaceId={spawnPreselectedWsId}
        />,
        document.body,
      )}

      {/* Worktree-only dialog — portalled to body to escape overflow-hidden parents */}
      {worktreeDialogOpen && worktreeProjectId && createPortal(
        <WorktreeCreateDialog
          projectId={worktreeProjectId}
          isOpen={worktreeDialogOpen}
          onClose={closeWorktreeDialog}
        />,
        document.body,
      )}
    </div>
  )
}

function AgentButton({ agent, onClick }: { agent: AgentConfig; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] bg-[var(--t-bg-elevated)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] px-2 py-1.5 transition-all active:scale-[0.97]"
      title={agent.name}
    >
      <AgentIcon icon={agent.icon} size={15} />
    </button>
  )
}
