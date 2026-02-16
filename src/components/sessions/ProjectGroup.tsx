import { useMemo, useState, useEffect, useRef } from 'react'
import { SessionCard } from './SessionCard'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../types'

interface ProjectGroupProps {
  project: Project
  onNewSessionInProject: (projectPath: string) => void
  onNewSessionInWorktree: (projectPath: string, name?: string) => void
}

export function ProjectGroup({ project, onNewSessionInProject, onNewSessionInWorktree }: ProjectGroupProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const removeProject = useProjectStore((s) => s.removeProject)
  const archivedSessions = useSessionStore((s) => s.archivedSessions)
  const archivedOrder = useSessionStore((s) => s.archivedOrder)
  const [collapsed, setCollapsed] = useState(false)
  const [recentCollapsed, setRecentCollapsed] = useState(true)
  const [isRepo, setIsRepo] = useState(false)
  const [showNameInput, setShowNameInput] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const isActive = project.path === activeProjectId

  useEffect(() => {
    window.electronAPI.git.isRepo(project.path).then(setIsRepo).catch(() => setIsRepo(false))
  }, [project.path])

  useEffect(() => {
    if (showNameInput) nameInputRef.current?.focus()
  }, [showNameInput])

  // Close input on click outside
  useEffect(() => {
    if (!showNameInput) return
    const handler = (e: MouseEvent) => {
      if (nameInputRef.current && !nameInputRef.current.parentElement?.contains(e.target as Node)) {
        setShowNameInput(false)
        setWorktreeName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNameInput])

  const handleWorktreeSubmit = () => {
    const name = worktreeName.trim() || undefined
    setShowNameInput(false)
    setWorktreeName('')
    onNewSessionInWorktree(project.path, name)
  }

  const sorted = useMemo(() => {
    const projectSessions = sessionOrder.filter((id) => {
      const s = sessions.get(id)
      return s?.cwd === project.path || s?.originalRepo === project.path
    })
    const active: string[] = []
    const finished: string[] = []
    for (const id of projectSessions) {
      const s = sessions.get(id)?.status
      if (s === 'running' || s === 'idle') active.push(id)
      else finished.push(id)
    }
    return [...active, ...finished]
  }, [sessionOrder, sessions, project.path])

  const archivedForProject = useMemo(() => {
    return archivedOrder.filter((id) => {
      const s = archivedSessions.get(id)
      return s?.cwd === project.path || s?.originalRepo === project.path
    })
  }, [archivedOrder, archivedSessions, project.path])

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
          {isRepo && (
            <button
              onClick={() => setShowNameInput(true)}
              className="text-zinc-600 hover:text-violet-400 p-0.5 rounded hover:bg-[var(--t-border)] transition-colors"
              title="New agent in worktree"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
              </svg>
            </button>
          )}
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

      {/* Inline worktree name input */}
      {showNameInput && (
        <div className="px-2 pb-1.5">
          <div className="flex gap-1">
            <input
              ref={nameInputRef}
              type="text"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleWorktreeSubmit() }
                if (e.key === 'Escape') { setShowNameInput(false); setWorktreeName('') }
              }}
              placeholder="Worktree name, e.g. add-auth"
              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50"
            />
            <button
              onClick={handleWorktreeSubmit}
              className="px-2 py-1 text-[10px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {/* Sessions */}
      {!collapsed && (
        <div className="px-1 pb-1">
          {sorted.map((id) => {
            const session = sessions.get(id)
            return session ? <SessionCard key={id} session={session} isActive={id === activeSessionId} /> : null
          })}
          {sorted.length === 0 && archivedForProject.length === 0 && (
            <div className="text-center py-3 px-2">
              <div className="text-zinc-700 text-[11px]">No agents yet</div>
            </div>
          )}

          {/* Archived / Recent */}
          {archivedForProject.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setRecentCollapsed(!recentCollapsed)}
                className="flex items-center gap-1 px-2 py-1 w-full text-left group/recent"
              >
                <svg
                  width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                  className={`text-zinc-600 transition-transform duration-150 ${recentCollapsed ? '' : 'rotate-90'}`}
                >
                  <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
                </svg>
                <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
                  Recent
                </span>
                <span className="text-[10px] text-zinc-700 tabular-nums">
                  ({archivedForProject.length})
                </span>
              </button>
              {!recentCollapsed && (
                <div>
                  {archivedForProject.map((id) => {
                    const session = archivedSessions.get(id)
                    return session ? <SessionCard key={id} session={session} isActive={false} isArchived /> : null
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
