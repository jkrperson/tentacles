import { useMemo, useState } from 'react'
import { SessionCard } from './SessionCard'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../types'

interface ProjectGroupProps {
  project: Project
  onNewSessionInProject: (projectPath: string) => void
}

export function ProjectGroup({ project, onNewSessionInProject }: ProjectGroupProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const removeProject = useProjectStore((s) => s.removeProject)
  const [collapsed, setCollapsed] = useState(false)

  const isActive = project.path === activeProjectId

  const sorted = useMemo(() => {
    const projectSessions = sessionOrder.filter((id) => sessions.get(id)?.cwd === project.path)
    const active: string[] = []
    const finished: string[] = []
    for (const id of projectSessions) {
      const s = sessions.get(id)?.status
      if (s === 'running' || s === 'idle') active.push(id)
      else finished.push(id)
    }
    return [...active, ...finished]
  }, [sessionOrder, sessions, project.path])

  return (
    <div className={`mb-1 ${isActive ? 'bg-[var(--t-bg-elevated)] rounded-lg' : ''}`}>
      {/* Project header */}
      <div className="flex items-center gap-1 px-2 py-1.5 group">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 flex-shrink-0 transition-colors"
        >
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
            className={`transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
          >
            <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-zinc-400 truncate flex-1" title={project.path}>
          {project.name}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onNewSessionInProject(project.path)}
            className="text-zinc-600 hover:text-zinc-300 p-0.5 rounded hover:bg-[var(--t-border)] transition-colors"
            title="Add agent to project"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
          </button>
          <button
            onClick={() => removeProject(project.path)}
            className="text-zinc-600 hover:text-zinc-300 p-0.5 rounded hover:bg-[var(--t-border)] transition-colors"
            title="Remove project"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Sessions */}
      {!collapsed && (
        <div className="px-1 pb-1">
          {sorted.map((id) => {
            const session = sessions.get(id)
            return session ? <SessionCard key={id} session={session} isActive={id === activeSessionId} /> : null
          })}
          {sorted.length === 0 && (
            <div className="text-center py-3 px-2">
              <div className="text-zinc-700 text-[11px]">No agents yet</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
