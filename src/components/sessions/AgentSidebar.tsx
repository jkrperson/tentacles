import { useCallback, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useUIStore } from '../../stores/uiStore'
import { trpc } from '../../trpc'
import { ProjectGroup } from './ProjectGroup'
import { AgentSpawnDialog } from './AgentSpawnDialog'
import { WorktreeCreateDialog } from './WorktreeCreateDialog'
import { AgentIcon } from '../icons/AgentIcons'
import type { AgentConfig } from '../../types'

export function AgentSidebar() {
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const createSessionInWorkspace = useSessionStore((s) => s.createSessionInWorkspace)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const agents = useSettingsStore((s) => s.settings.agents)
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
  const reorderProjects = useProjectStore((s) => s.reorderProjects)
  const ensureMainWorkspace = useWorkspaceStore((s) => s.ensureMainWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

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

  // Project drag-and-drop state
  const [draggedProjectIdx, setDraggedProjectIdx] = useState<number | null>(null)
  const [dropTargetProjectIdx, setDropTargetProjectIdx] = useState<number | null>(null)
  const [projectDropPos, setProjectDropPos] = useState<'above' | 'below' | null>(null)

  const pinnedAgents = agents.filter((a) => a.enabled && a.pinned)
  const unpinnedAgents = agents.filter((a) => a.enabled && !a.pinned)

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

  const handleAddProject = useCallback(async () => {
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) addProject(dir)
  }, [addProject])

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

  const handleNewWorkspace = useCallback((projectId: string) => {
    openWorktreeDialog(projectId)
  }, [openWorktreeDialog])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Top section — Agent spawn icons (spawn into active workspace) */}
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

        {/* Add project button — only when no projects */}
        {projectOrder.length === 0 && (
          <button
            onClick={handleAddProject}
            className="w-full flex items-center justify-center gap-2 text-[11px] text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] border border-dashed border-[var(--t-border)] px-3 py-1.5 transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM13 5H9.5a.5.5 0 0 1-.5-.5V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/>
              <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
            </svg>
            Add Project
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-[var(--t-border)] mb-0.5" />

      {/* Workspace list grouped by project */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {projectOrder.map((path, index) => {
          const project = projects.get(path)
          if (!project) return null
          return (
            <ProjectGroup
              key={path}
              project={project}
              onSpawnAgent={handleSpawnAgent}
              onOpenSpawnDialog={(projectId) => openSpawnDialog(projectId)}
              onNewWorkspace={handleNewWorkspace}
              draggable
              isDraggingProject={draggedProjectIdx === index}
              projectDropPosition={dropTargetProjectIdx === index ? projectDropPos : null}
              onProjectDragStart={(e) => {
                setDraggedProjectIdx(index)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('application/x-project', path)
              }}
              onProjectDragOver={(e) => {
                if (!e.dataTransfer.types.includes('application/x-project')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                const midY = rect.top + rect.height / 2
                setDropTargetProjectIdx(index)
                setProjectDropPos(e.clientY < midY ? 'above' : 'below')
              }}
              onProjectDrop={(e) => {
                e.preventDefault()
                if (draggedProjectIdx == null || dropTargetProjectIdx == null) return
                let toIdx = projectDropPos === 'below' ? dropTargetProjectIdx + 1 : dropTargetProjectIdx
                if (draggedProjectIdx < toIdx) toIdx -= 1
                reorderProjects(draggedProjectIdx, toIdx)
                setDraggedProjectIdx(null)
                setDropTargetProjectIdx(null)
                setProjectDropPos(null)
              }}
              onProjectDragEnd={() => {
                setDraggedProjectIdx(null)
                setDropTargetProjectIdx(null)
                setProjectDropPos(null)
              }}
            />
          )
        })}

        {projectOrder.length === 0 && sessionOrder.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[12px] mb-1">No projects yet</div>
            <div className="text-zinc-700 text-[11px]">
              Add a project to get started
            </div>
          </div>
        )}
      </div>

      {/* Bottom — Add project (when projects exist) + Settings */}
      <div className="flex-shrink-0 border-t border-[var(--t-border)] px-2 py-1.5 space-y-0.5">
        {projectOrder.length > 0 && (
          <button
            onClick={handleAddProject}
            className="flex items-center gap-2 text-[11px] text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] px-1.5 py-1 transition-colors w-full rounded"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            Add project
          </button>
        )}
        <button
          onClick={toggleSettings}
          className="flex items-center gap-2 text-[11px] text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] px-1.5 py-1 transition-colors w-full rounded"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z"/>
          </svg>
          Settings
        </button>
      </div>

      {/* Spawn dialog */}
      {spawnDialogOpen && spawnProjectId && (
        <AgentSpawnDialog
          projectId={spawnProjectId}
          isOpen={spawnDialogOpen}
          onClose={closeSpawnDialog}
          preselectedWorkspaceId={spawnPreselectedWsId}
        />
      )}

      {/* Worktree-only dialog */}
      {worktreeDialogOpen && worktreeProjectId && (
        <WorktreeCreateDialog
          projectId={worktreeProjectId}
          isOpen={worktreeDialogOpen}
          onClose={closeWorktreeDialog}
        />
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
