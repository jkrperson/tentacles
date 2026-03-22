import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { AgentIcon } from '../icons/AgentIcons'
import { FileIcon } from '../common/FileIcon'
import type { AgentIconKey } from '../../types'

const EMPTY_FILES: string[] = []

const STATUS_COLORS: Record<string, { cssVar: string; pulse?: boolean }> = {
  running:     { cssVar: 'var(--t-status-running)',     pulse: true },
  needs_input: { cssVar: 'var(--t-status-needs-input)', pulse: true },
  completed:   { cssVar: 'var(--t-status-completed)' },
  idle:        { cssVar: 'var(--t-status-idle)' },
  errored:     { cssVar: 'var(--t-status-errored)' },
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

type TabItem = { type: 'session'; id: string } | { type: 'file'; path: string }

function tabKey(item: TabItem): string {
  return item.type === 'session' ? `s:${item.id}` : `f:${item.path}`
}

export function TerminalTabs() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const tabOrder = useSessionStore((s) => s.tabOrder)
  const setActive = useSessionStore((s) => s.setActiveSession)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const openFiles = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.openFiles ?? EMPTY_FILES : EMPTY_FILES
  })
  const selectedFilePath = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.selectedFilePath ?? null : null
  })
  const openFile = useProjectStore((s) => s.openFile)
  const mainPanelMode = useUIStore((s) => s.mainPanelMode)
  const setMainPanelMode = useUIStore((s) => s.setMainPanelMode)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const agents = useSettingsStore((s) => s.settings.agents)

  const projectSessions = useMemo(
    () => activeProjectId
      ? tabOrder.filter((id) => {
          const s = sessions.get(id)
          return s && sessionBelongsToProject(s.workspaceId, activeProjectId, workspaces)
        })
      : tabOrder,
    [tabOrder, sessions, activeProjectId, workspaces],
  )

  // Unified tab order — reconciled with actual sessions and open files
  const [unifiedOrder, setUnifiedOrder] = useState<string[]>([])
  const prevKeysRef = useRef<string>('')

  useEffect(() => {
    const sessionKeys = projectSessions.map((id) => `s:${id}`)
    const fileKeys = openFiles.map((path) => `f:${path}`)
    const allKeys = new Set([...sessionKeys, ...fileKeys])
    const keysStr = [...allKeys].join(',')

    // Only reconcile when the set of available items changes
    if (keysStr === prevKeysRef.current) return
    prevKeysRef.current = keysStr

    setUnifiedOrder((prev) => {
      const kept = prev.filter((k) => allKeys.has(k))
      const existing = new Set(kept)
      // Add new sessions in their tabOrder position, new files at end
      const newItems = [...sessionKeys, ...fileKeys].filter((k) => !existing.has(k))
      if (newItems.length === 0 && kept.length === prev.length) return prev
      return [...kept, ...newItems]
    })
  }, [projectSessions, openFiles])

  // Parse unified order into TabItems
  const tabs: TabItem[] = useMemo(() =>
    unifiedOrder.map((key): TabItem | null => {
      if (key.startsWith('s:')) return { type: 'session', id: key.slice(2) }
      if (key.startsWith('f:')) return { type: 'file', path: key.slice(2) }
      return null
    }).filter((t): t is TabItem => t !== null),
    [unifiedOrder],
  )

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', unifiedOrder[index])
  }

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    setDropTargetIndex(index)
    setDropSide(e.clientX < midX ? 'left' : 'right')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex == null || dropTargetIndex == null) return
    let toIdx = dropSide === 'right' ? dropTargetIndex + 1 : dropTargetIndex
    if (draggedIndex < toIdx) toIdx -= 1
    if (draggedIndex !== toIdx) {
      setUnifiedOrder((prev) => {
        const next = [...prev]
        const [moved] = next.splice(draggedIndex, 1)
        next.splice(toIdx, 0, moved)
        return next
      })
    }
    setDraggedIndex(null)
    setDropTargetIndex(null)
    setDropSide(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDropTargetIndex(null)
    setDropSide(null)
  }

  if (tabs.length === 0) return null

  return (
    <div className="flex items-center h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] overflow-x-auto">
      {tabs.map((tab, index) => {
        const key = tabKey(tab)
        const isDragging = draggedIndex === index
        const isDropTarget = dropTargetIndex === index

        if (tab.type === 'session') {
          const session = sessions.get(tab.id)
          if (!session) return null
          const isActive = tab.id === activeSessionId && mainPanelMode === 'session'
          const statusConfig = STATUS_COLORS[session.status]
          const agentConfig = agents.find((a) => a.id === session.agentType)
          const agentIcon: AgentIconKey = agentConfig?.icon ?? 'generic'
          return (
            <button
              key={key}
              onClick={() => {
                setActive(tab.id)
                setMainPanelMode('session')
              }}
              draggable
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
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
                className={`flex-shrink-0 ${statusConfig?.pulse ? 'animate-pulse' : ''}`}
                style={{ color: statusConfig?.cssVar ?? 'var(--t-status-idle)' }}
              >
                <AgentIcon icon={agentIcon} size={12} />
              </span>
              <span className="truncate max-w-36">{session.name}</span>
              {session.hasUnread && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-accent)] flex-shrink-0" />
              )}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--t-accent)]" />}
            </button>
          )
        }

        // File tab
        const isActive = tab.path === selectedFilePath && mainPanelMode === 'editor'
        return (
          <button
            key={key}
            onClick={() => {
              if (activeProjectId) openFile(activeProjectId, tab.path)
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent('editor:close-tab', { detail: { path: tab.path } }))
              }
            }}
            draggable
            onDragStart={(e) => handleDragStart(index, e)}
            onDragOver={(e) => handleDragOver(index, e)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            className={`group/tab relative flex items-center gap-1.5 px-3 h-full text-[12px] border-r border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
              isActive
                ? 'bg-[var(--t-bg-base)] text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
            } ${isDragging ? 'opacity-40' : ''}`}
            style={isDropTarget && dropSide ? {
              borderLeft: dropSide === 'left' ? '2px solid rgb(139 92 246)' : undefined,
              borderRight: dropSide === 'right' ? '2px solid rgb(139 92 246)' : undefined,
            } : undefined}
          >
            <FileIcon name={basename(tab.path)} size={12} />
            <span className="truncate max-w-40">{basename(tab.path)}</span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('editor:close-tab', { detail: { path: tab.path } }))
              }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--t-border)] opacity-0 group-hover/tab:opacity-100 transition-opacity"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </span>
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--t-accent)]" />}
          </button>
        )
      })}
    </div>
  )
}
