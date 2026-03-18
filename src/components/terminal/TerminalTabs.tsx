import { useMemo, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'

const STATUS_DOTS: Record<string, { cssVar: string; pulse?: boolean }> = {
  running:     { cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { cssVar: 'var(--t-status-completed)' },
  idle:        { cssVar: 'var(--t-status-idle)' },
  errored:     { cssVar: 'var(--t-status-errored)' },
}

export function TerminalTabs() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const tabOrder = useSessionStore((s) => s.tabOrder)
  const reorderTabs = useSessionStore((s) => s.reorderTabs)
  const setActive = useSessionStore((s) => s.setActiveSession)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)

  const projectSessions = useMemo(
    () => activeProjectId
      ? tabOrder.filter((id) => {
          const s = sessions.get(id)
          return s && sessionBelongsToProject(s.workspaceId, activeProjectId, workspaces)
        })
      : tabOrder,
    [tabOrder, sessions, activeProjectId, workspaces],
  )

  if (projectSessions.length === 0) return null

  return (
    <div className="flex items-center h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] overflow-x-auto">
      {projectSessions.map((id, index) => {
        const session = sessions.get(id)
        if (!session) return null
        const isActive = id === activeSessionId
        const isDragging = draggedIndex === index
        const isDropTarget = dropTargetIndex === index
        return (
          <button
            key={id}
            onClick={() => setActive(id)}
            draggable
            onDragStart={(e) => {
              setDraggedIndex(index)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', id)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const rect = e.currentTarget.getBoundingClientRect()
              const midX = rect.left + rect.width / 2
              setDropTargetIndex(index)
              setDropSide(e.clientX < midX ? 'left' : 'right')
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggedIndex == null || dropTargetIndex == null || !activeProjectId) return
              let toIdx = dropSide === 'right' ? dropTargetIndex + 1 : dropTargetIndex
              if (draggedIndex < toIdx) toIdx -= 1
              reorderTabs(draggedIndex, toIdx, activeProjectId)
              setDraggedIndex(null)
              setDropTargetIndex(null)
              setDropSide(null)
            }}
            onDragEnd={() => {
              setDraggedIndex(null)
              setDropTargetIndex(null)
              setDropSide(null)
            }}
            className={`relative flex items-center gap-2 px-4 h-full text-[12px] border-r border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
              isActive
                ? 'bg-[var(--t-bg-base)] text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
            } ${isDragging ? 'opacity-40' : ''}`}
            style={isDropTarget && dropSide ? {
              borderLeft: dropSide === 'left' ? '2px solid rgb(139 92 246)' : undefined,
              borderRight: dropSide === 'right' ? '2px solid rgb(139 92 246)' : undefined,
            } : undefined}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[session.status]?.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: STATUS_DOTS[session.status]?.cssVar ?? 'var(--t-status-idle)' }}
            />
            <span className="truncate max-w-36">{session.name}</span>
            {session.hasUnread && !isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
            )}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500" />}
          </button>
        )
      })}
    </div>
  )
}
