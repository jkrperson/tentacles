import { useMemo, useState, useCallback } from 'react'
import { WorkspaceItem } from './WorkspaceItem'
import { useSessionStore } from '../../stores/sessionStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { useProjectStore } from '../../stores/projectStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useUIStore } from '../../stores/uiStore'
import type { Project } from '../../types'

interface ProjectGroupProps {
  project: Project
  onSpawnAgent: (workspaceId: string, name?: string) => void
  onOpenSpawnDialog?: (projectId: string) => void
  onNewWorkspace: (projectId: string) => void
  // Project-level drag-and-drop
  draggable?: boolean
  isDraggingProject?: boolean
  projectDropPosition?: 'above' | 'below' | null
  onProjectDragStart?: (e: React.DragEvent) => void
  onProjectDragOver?: (e: React.DragEvent) => void
  onProjectDragEnd?: (e: React.DragEvent) => void
  onProjectDrop?: (e: React.DragEvent) => void
}

export function ProjectGroup({
  project, onSpawnAgent, onNewWorkspace,
  draggable: projectDraggable, isDraggingProject, projectDropPosition,
  onProjectDragStart, onProjectDragOver, onProjectDragEnd, onProjectDrop,
}: ProjectGroupProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const getProjectWorkspaces = useWorkspaceStore((s) => s.getProjectWorkspaces)
  const reorderWorkspaces = useWorkspaceStore((s) => s.reorderWorkspaces)

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const removeProject = useProjectStore((s) => s.removeProject)
  const showConfirm = useConfirmStore((s) => s.show)
  const openProjectSettingsPage = useUIStore((s) => s.openProjectSettingsPage)

  const isActive = activeProjectId === project.path

  const [projectCollapsed, setProjectCollapsed] = useState(false)

  // Workspace drag-and-drop
  const [draggedWsIndex, setDraggedWsIndex] = useState<number | null>(null)
  const [dropTargetWsIndex, setDropTargetWsIndex] = useState<number | null>(null)
  const [wsDropPosition, setWsDropPosition] = useState<'above' | 'below' | null>(null)

  // Track which workspace is showing the name input
  const [spawnTargetWsId, setSpawnTargetWsId] = useState<string | null>(null)

  const projectWorkspaces = useMemo(() => {
    return getProjectWorkspaces(project.id)
  }, [getProjectWorkspaces, project.id, workspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectSessions = useMemo(() => {
    return sessionOrder.filter((id) => {
      const s = sessions.get(id)
      return s && sessionBelongsToProject(s.workspaceId, project.path, workspaces)
    })
  }, [sessionOrder, sessions, project.path, workspaces])

  const worktrees = useMemo(() => {
    return projectWorkspaces.filter((ws) => ws.type !== 'main')
  }, [projectWorkspaces])

  // Show inline input inside a workspace card
  const handleSpawnInWorkspace = useCallback((workspaceId: string) => {
    setSpawnTargetWsId(workspaceId)
  }, [])

  const handleCancelSpawn = useCallback(() => {
    setSpawnTargetWsId(null)
  }, [])

  return (
    <div
      className={`mb-1 ${isDraggingProject ? 'opacity-40' : ''}`}
      draggable={projectDraggable}
      onDragStart={onProjectDragStart}
      onDragOver={onProjectDragOver}
      onDragEnd={onProjectDragEnd}
      onDrop={onProjectDrop}
      style={projectDropPosition ? {
        borderTop: projectDropPosition === 'above' ? '2px solid var(--t-accent)' : undefined,
        borderBottom: projectDropPosition === 'below' ? '2px solid var(--t-accent)' : undefined,
      } : undefined}
    >
      {/* Project header */}
      <div
        className="flex items-center gap-1.5 px-2 py-2 cursor-pointer"
        onClick={() => {
          setProjectCollapsed(!projectCollapsed)
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            setProjectCollapsed(!projectCollapsed)
          }}
          className="p-0.5 transition-colors"
        >
          <svg
            width="9" height="9" viewBox="0 0 16 16" fill="currentColor"
            className={`text-zinc-600 transition-transform duration-150 ${projectCollapsed ? '' : 'rotate-90'}`}
          >
            <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
          </svg>
        </button>

        <span className={`text-[11px] font-bold truncate flex-1 transition-colors ${
          isActive ? 'text-[var(--t-accent)]' : 'text-zinc-300 hover:text-zinc-100'
        }`} title={project.path}>
          {project.name}
        </span>

        {projectSessions.length > 0 && (
          <span className="text-[9px] text-zinc-600 font-mono flex-shrink-0">
            {projectSessions.length}
          </span>
        )}

        {/* Project actions — compact */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => openProjectSettingsPage(project.id)}
            className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
            title="Settings"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.068.727c.243-.97 1.62-.97 1.864 0l.071.286a.96.96 0 001.622.434l.205-.211c.695-.719 1.888-.03 1.613.929l-.084.293a.96.96 0 001.187 1.187l.293-.084c.96-.275 1.648.918.929 1.613l-.211.205a.96.96 0 00.434 1.622l.286.071c.97.243.97 1.62 0 1.864l-.286.071a.96.96 0 00-.434 1.622l.211.205c.719.695.03 1.888-.929 1.613l-.293-.084a.96.96 0 00-1.187 1.187l.084.293c.275.96-.918 1.648-1.613.929l-.205-.211a.96.96 0 00-1.622.434l-.071.286c-.243.97-1.62.97-1.864 0l-.071-.286a.96.96 0 00-1.622-.434l-.205.211c-.695.719-1.888.03-1.613-.929l.084-.293a.96.96 0 00-1.187-1.187l-.293.084c-.96.275-1.648-.918-.929-1.613l.211-.205a.96.96 0 00-.434-1.622l-.286-.071c-.97-.243-.97-1.62 0-1.864l.286-.071a.96.96 0 00.434-1.622l-.211-.205c-.719-.695-.03-1.888.929-1.613l.293.084A.96.96 0 005.17 2.03l-.084-.293c-.275-.96.918-1.648 1.613-.929l.205.211a.96.96 0 001.622-.434l.071-.286zM8 11a3 3 0 100-6 3 3 0 000 6z"/>
            </svg>
          </button>
          <button
            onClick={() => {
              showConfirm({
                title: `Remove ${project.name}?`,
                message: 'This will remove the project from the sidebar. No files will be deleted.',
                confirmLabel: 'Remove',
                onConfirm: () => removeProject(project.path),
              })
            }}
            className="p-1 text-zinc-700 hover:text-red-400 transition-colors"
            title="Remove project"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Workspace cards */}
      {!projectCollapsed && (
        <div className="px-1.5 pb-1 space-y-1" onClick={(e) => e.stopPropagation()}>
          {/* Render workspace cards */}
          {projectWorkspaces.map((ws) => {
            const wtIdx = ws.type !== 'main' ? worktrees.indexOf(ws) : -1
            return (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                onSpawnAgent={onSpawnAgent}
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
                  reorderWorkspaces(draggedWsIndex, toIdx, project.id)
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
            onClick={() => onNewWorkspace(project.id)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] rounded transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            New workspace
          </button>
        </div>
      )}

      {/* Separator */}
      <div className="mx-2 border-b border-[var(--t-border)]" />
    </div>
  )
}
