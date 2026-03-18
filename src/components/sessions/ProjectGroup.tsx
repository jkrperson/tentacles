import { useMemo, useState } from 'react'
import { SessionCard } from './SessionCard'
import { WorkspaceItem } from './WorkspaceItem'
import { useSessionStore } from '../../stores/sessionStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../types'

interface ProjectGroupProps {
  project: Project
  onSpawnAgent: (workspaceId: string) => void
  onOpenSpawnDialog: (projectId: string) => void
  onNewWorkspace: (projectId: string) => void
}

export function ProjectGroup({ project, onSpawnAgent, onOpenSpawnDialog, onNewWorkspace }: ProjectGroupProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const reorderSessions = useSessionStore((s) => s.reorderSessions)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const getProjectWorkspaces = useWorkspaceStore((s) => s.getProjectWorkspaces)

  const [projectCollapsed, setProjectCollapsed] = useState(false)
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false)
  const [agentsCollapsed, setAgentsCollapsed] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  const projectWorkspaces = useMemo(() => {
    return getProjectWorkspaces(project.id)
  }, [getProjectWorkspaces, project.id, workspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectSessions = useMemo(() => {
    return sessionOrder.filter((id) => {
      const s = sessions.get(id)
      return s && sessionBelongsToProject(s.workspaceId, project.path, workspaces)
    })
  }, [sessionOrder, sessions, project.path, workspaces])

  return (
    <div
      className="mb-0.5 mt-1 cursor-pointer"
      onClick={() => {
        setActiveProject(project.path)
        if (projectSessions[0]) setActiveSession(projectSessions[0])
      }}
    >
      {/* Project header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setProjectCollapsed(!projectCollapsed)
            setActiveProject(project.path)
            if (projectSessions[0]) setActiveSession(projectSessions[0])
          }}
          className="flex items-center gap-1 text-[11px] font-bold text-zinc-300 hover:text-zinc-100 truncate text-left transition-colors"
          title={project.path}
        >
          <svg
            width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
            className={`flex-shrink-0 transition-transform duration-150 ${projectCollapsed ? '' : 'rotate-90'}`}
          >
            <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
          </svg>
          {project.name}
        </button>
        {projectSessions.length > 0 && (
          <span className="text-[10px] text-zinc-600 flex-shrink-0">({projectSessions.length})</span>
        )}
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          {/* New workspace button */}
          <button
            onClick={() => onNewWorkspace(project.id)}
            className="text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] p-1 transition-all active:scale-[0.9]"
            title="New workspace"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
            </svg>
          </button>
          {/* Quick add agent (main workspace) */}
          <button
            onClick={() => onOpenSpawnDialog(project.id)}
            className="text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] p-1 transition-all active:scale-[0.9]"
            title="Add agent"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
          </button>
        </div>
      </div>

      {!projectCollapsed && (
        <div className="px-1 pb-0.5" onClick={(e) => e.stopPropagation()}>
          {/* Workspaces section — always visible */}
          <div className="mb-1">
            <button
              onClick={() => setWorkspacesCollapsed(!workspacesCollapsed)}
              className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors w-full text-left"
            >
              <svg
                width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                className={`transition-transform duration-150 ${workspacesCollapsed ? '' : 'rotate-90'}`}
              >
                <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
              </svg>
              Workspaces
            </button>
            {!workspacesCollapsed && (
              <div className="pl-1">
                {projectWorkspaces.map((ws) => (
                  <WorkspaceItem key={ws.id} workspace={ws} />
                ))}
                <button
                  onClick={() => onNewWorkspace(project.id)}
                  className="flex items-center gap-1.5 mx-1 px-2 py-1 text-[var(--t-text-faint)] hover:text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] text-[10px] transition-all active:scale-[0.97]"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                  </svg>
                  New worktree
                </button>
              </div>
            )}
          </div>

          {/* Agents section */}
          <div>
            <button
              onClick={() => setAgentsCollapsed(!agentsCollapsed)}
              className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors w-full text-left"
            >
              <svg
                width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                className={`transition-transform duration-150 ${agentsCollapsed ? '' : 'rotate-90'}`}
              >
                <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
              </svg>
              Agents
            </button>
            {!agentsCollapsed && (
            <div>
              {projectSessions.map((id, index) => {
                const session = sessions.get(id)
                if (!session) return null
                return (
                  <SessionCard
                    key={id}
                    session={session}
                    isActive={id === activeSessionId}
                    draggable
                    isDragging={draggedIndex === index}
                    dropPosition={dropTargetIndex === index ? dropPosition : null}
                    onDragStart={(e) => {
                      setDraggedIndex(index)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', id)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      const rect = e.currentTarget.getBoundingClientRect()
                      const midY = rect.top + rect.height / 2
                      setDropTargetIndex(index)
                      setDropPosition(e.clientY < midY ? 'above' : 'below')
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggedIndex == null || dropTargetIndex == null) return
                      let toIdx = dropPosition === 'below' ? dropTargetIndex + 1 : dropTargetIndex
                      if (draggedIndex < toIdx) toIdx -= 1
                      reorderSessions(draggedIndex, toIdx, project.path)
                      setDraggedIndex(null)
                      setDropTargetIndex(null)
                      setDropPosition(null)
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null)
                      setDropTargetIndex(null)
                      setDropPosition(null)
                    }}
                  />
                )
              })}
              {projectSessions.length === 0 && (
                <div className="px-1 py-1">
                  <button
                    onClick={() => {
                      const mainWs = useWorkspaceStore.getState().ensureMainWorkspace(project.id)
                      onSpawnAgent(mainWs.id)
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 text-[var(--t-text-faint)] hover:text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] text-[11px] transition-all active:scale-[0.97]"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                    </svg>
                    New agent
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Separator */}
      <div className="mx-2 border-b border-[var(--t-border)]" />
    </div>
  )
}
