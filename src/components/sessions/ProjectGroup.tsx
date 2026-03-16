import { useMemo, useState, useEffect, useRef } from 'react'
import { SessionCard } from './SessionCard'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../types'

interface ProjectGroupProps {
  project: Project
}

export function ProjectGroup({ project }: ProjectGroupProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const createSessionInProject = useSessionStore((s) => s.createSessionInProject)
  const createSessionInWorktree = useSessionStore((s) => s.createSessionInWorktree)
  const reorderSessions = useSessionStore((s) => s.reorderSessions)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const [collapsed, setCollapsed] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

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
    createSessionInWorktree(project.path, name)
  }

  const sorted = useMemo(() => {
    return sessionOrder.filter((id) => {
      const s = sessions.get(id)
      return s?.cwd === project.path || s?.originalRepo === project.path
    })
  }, [sessionOrder, sessions, project.path])

  return (
    <div className="mb-0.5">
      {/* Project header */}
      <div className="flex items-center gap-1 px-2 py-1 group">
        <button
          onClick={() => {
            setActiveProject(project.path)
            const firstSession = sessionOrder.find((id) => {
              const s = sessions.get(id)
              return s?.cwd === project.path || s?.originalRepo === project.path
            })
            if (firstSession) setActiveSession(firstSession)
          }}
          className="text-[11px] font-bold text-zinc-300 hover:text-zinc-100 truncate text-left transition-colors"
          title={project.path}
        >
          {project.name}
        </button>
        {sorted.length > 0 && (
          <span className="text-[10px] text-zinc-600 flex-shrink-0">({sorted.length})</span>
        )}
        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => createSessionInProject(project.path)}
            className="text-zinc-600 hover:text-zinc-300 p-0.5 hover:bg-[var(--t-border)] transition-colors"
            title="Add agent"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-zinc-600 hover:text-zinc-300 p-0.5 hover:bg-[var(--t-border)] transition-colors"
          >
            <svg
              width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
              className={`transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            >
              <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Inline worktree name input */}
      {showNameInput && (
        <div className="px-2 pb-1">
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
        <div className="px-1 pb-0.5">
          {sorted.map((id, index) => {
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
          {sorted.length === 0 && (
            <div className="px-2 py-1.5">
              <button
                onClick={() => createSessionInProject(project.path)}
                className="text-zinc-700 hover:text-zinc-400 text-[11px] transition-colors"
              >
                + New agent
              </button>
            </div>
          )}
        </div>
      )}

      {/* Separator */}
      <div className="mx-2 border-b border-[var(--t-border)]" />
    </div>
  )
}
