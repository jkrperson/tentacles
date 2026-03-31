import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { useActiveWorkspaceDir } from '../../hooks/useActiveWorkspaceDir'
import { AgentIcon } from '../icons/AgentIcons'
import { FileIcon } from '../common/FileIcon'
import type { AgentIconKey, DiffViewState } from '../../types'

const EMPTY_FILES: string[] = []
const EMPTY_DIFFS: DiffViewState[] = []

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

type TabItem =
  | { type: 'session'; id: string }
  | { type: 'file'; path: string }
  | { type: 'diff'; filePath: string; staged: boolean }

function tabKey(item: TabItem): string {
  if (item.type === 'session') return `s:${item.id}`
  if (item.type === 'file') return `f:${item.path}`
  return `d:${item.filePath}`
}

export function TerminalTabs() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const tabOrder = useSessionStore((s) => s.tabOrder)
  const setActive = useSessionStore((s) => s.setActiveSession)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { dir: workspaceDir } = useActiveWorkspaceDir()
  const cacheKey = workspaceDir ?? activeProjectId
  const openFiles = useProjectStore((s) => {
    return cacheKey ? s.fileTreeCache.get(cacheKey)?.openFiles ?? EMPTY_FILES : EMPTY_FILES
  })
  const selectedFilePath = useProjectStore((s) => {
    return cacheKey ? s.fileTreeCache.get(cacheKey)?.selectedFilePath ?? null : null
  })
  const openFile = useProjectStore((s) => s.openFile)
  const openDiffs = useProjectStore((s) => {
    return cacheKey ? s.fileTreeCache.get(cacheKey)?.openDiffs ?? EMPTY_DIFFS : EMPTY_DIFFS
  })
  const selectedDiffPath = useProjectStore((s) => {
    return cacheKey ? s.fileTreeCache.get(cacheKey)?.selectedDiffPath ?? null : null
  })
  const setSelectedDiff = useProjectStore((s) => s.setSelectedDiff)
  const closeDiff = useProjectStore((s) => s.closeDiff)
  const mainPanelMode = useUIStore((s) => s.mainPanelMode)
  const setMainPanelMode = useUIStore((s) => s.setMainPanelMode)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const agents = useSettingsStore((s) => s.settings.agents)

  // Filter session tabs to the active workspace
  // Priority: session's workspace > explicit UI workspace selection
  const sessionWorkspaceId = useSessionStore((s) => {
    const aid = s.activeSessionId
    if (!aid) return null
    return s.sessions.get(aid)?.workspaceId ?? null
  })
  const explicitWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const activeWorkspaceId = sessionWorkspaceId ?? explicitWorkspaceId

  const workspaceSessions = useMemo(
    () => {
      if (!activeWorkspaceId) {
        // Fallback: filter by project
        return activeProjectId
          ? tabOrder.filter((id) => {
              const s = sessions.get(id)
              return s && sessionBelongsToProject(s.workspaceId, activeProjectId, workspaces)
            })
          : tabOrder
      }
      return tabOrder.filter((id) => {
        const s = sessions.get(id)
        return s?.workspaceId === activeWorkspaceId
      })
    },
    [tabOrder, sessions, activeProjectId, activeWorkspaceId, workspaces],
  )

  // Unified tab order — reconciled with actual sessions and open files
  const [unifiedOrder, setUnifiedOrder] = useState<string[]>([])
  const prevKeysRef = useRef<string>('')

  useEffect(() => {
    const sessionKeys = workspaceSessions.map((id) => `s:${id}`)
    const fileKeys = openFiles.map((path) => `f:${path}`)
    const diffKeys = openDiffs.map((d) => `d:${d.filePath}`)
    const allKeys = new Set([...sessionKeys, ...fileKeys, ...diffKeys])
    const keysStr = [...allKeys].join(',')

    // Only reconcile when the set of available items changes
    if (keysStr === prevKeysRef.current) return
    prevKeysRef.current = keysStr

    setUnifiedOrder((prev) => {
      const kept = prev.filter((k) => allKeys.has(k))
      const existing = new Set(kept)
      // Add new sessions in their tabOrder position, new files and diffs at end
      const newItems = [...sessionKeys, ...fileKeys, ...diffKeys].filter((k) => !existing.has(k))
      if (newItems.length === 0 && kept.length === prev.length) return prev
      return [...kept, ...newItems]
    })
  }, [workspaceSessions, openFiles, openDiffs])

  // Parse unified order into TabItems
  const tabs: TabItem[] = useMemo(() =>
    unifiedOrder.map((key): TabItem | null => {
      if (key.startsWith('s:')) return { type: 'session', id: key.slice(2) }
      if (key.startsWith('f:')) return { type: 'file', path: key.slice(2) }
      if (key.startsWith('d:')) {
        const filePath = key.slice(2)
        const diff = openDiffs.find((d) => d.filePath === filePath)
        if (diff) return { type: 'diff', filePath: diff.filePath, staged: diff.staged }
      }
      return null
    }).filter((t): t is TabItem => t !== null),
    [unifiedOrder, openDiffs],
  )

  // Listen for tabs:cycle events from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const { direction } = (e as CustomEvent<{ direction: 'next' | 'prev' }>).detail
      if (tabs.length < 2) return

      // Find the currently active tab index
      let activeIdx = -1
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i]
        if (tab.type === 'session' && tab.id === activeSessionId && mainPanelMode === 'session') {
          activeIdx = i
          break
        }
        if (tab.type === 'file' && tab.path === selectedFilePath && mainPanelMode === 'editor') {
          activeIdx = i
          break
        }
        if (tab.type === 'diff' && tab.filePath === selectedDiffPath && mainPanelMode === 'editor') {
          activeIdx = i
          break
        }
      }

      let nextIdx: number
      if (direction === 'next') {
        nextIdx = activeIdx < tabs.length - 1 ? activeIdx + 1 : 0
      } else {
        nextIdx = activeIdx > 0 ? activeIdx - 1 : tabs.length - 1
      }

      const nextTab = tabs[nextIdx]
      if (nextTab.type === 'session') {
        setActive(nextTab.id)
        setMainPanelMode('session')
      } else if (nextTab.type === 'file') {
        if (cacheKey) openFile(cacheKey, nextTab.path)
      } else if (nextTab.type === 'diff') {
        if (cacheKey) {
          setSelectedDiff(cacheKey, nextTab.filePath)
          setMainPanelMode('editor')
        }
      }
    }

    window.addEventListener('tabs:cycle', handler)
    return () => window.removeEventListener('tabs:cycle', handler)
  }, [tabs, activeSessionId, selectedFilePath, selectedDiffPath, mainPanelMode, cacheKey, setActive, setMainPanelMode, openFile, setSelectedDiff])

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

  const closeTab = useSessionStore((s) => s.closeTab)

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
          const ws = workspaces.get(session.workspaceId)
          const isWorktree = ws?.type === 'worktree'
          const branchName = isWorktree ? ws?.name : null
          return (
            <button
              key={key}
              onClick={() => {
                setActive(tab.id)
                setMainPanelMode('session')
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tab.id)
                }
              }}
              draggable
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              className={`group/tab relative flex items-center gap-2 px-3 h-full text-[12px] border-r border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
                isActive
                  ? 'bg-[var(--t-bg-base)] text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
              } ${isDragging ? 'opacity-40' : ''}`}
              style={isDropTarget && dropSide ? {
                borderLeft: dropSide === 'left' ? '2px solid var(--t-accent)' : undefined,
                borderRight: dropSide === 'right' ? '2px solid var(--t-accent)' : undefined,
              } : undefined}
            >
              <span
                className={`flex-shrink-0 ${statusConfig?.pulse ? 'animate-pulse' : ''}`}
                style={{ color: statusConfig?.cssVar ?? 'var(--t-status-idle)' }}
              >
                <AgentIcon icon={agentIcon} size={12} />
              </span>
              <span className="truncate max-w-36">{session.name}</span>
              {/* Worktree branch badge */}
              {branchName && (
                <span className="flex items-center gap-0.5 text-[9px] text-[var(--t-accent)]/60 flex-shrink-0 font-mono">
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
                    <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
                  </svg>
                  {branchName}
                </span>
              )}
              {session.hasUnread && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-accent)] flex-shrink-0" />
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
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
        }

        if (tab.type === 'file') {
          // File tab
          const isActive = tab.path === selectedFilePath && mainPanelMode === 'editor' && !selectedDiffPath
          return (
            <button
              key={key}
              onClick={() => {
                if (cacheKey) openFile(cacheKey, tab.path)
                // Clear diff selection when switching to a file tab
                if (cacheKey) setSelectedDiff(cacheKey, null)
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
                borderLeft: dropSide === 'left' ? '2px solid var(--t-accent)' : undefined,
                borderRight: dropSide === 'right' ? '2px solid var(--t-accent)' : undefined,
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
        }

        // Diff tab
        {
          const isActive = tab.filePath === selectedDiffPath && mainPanelMode === 'editor'
          return (
            <button
              key={key}
              onClick={() => {
                if (cacheKey) {
                  setSelectedDiff(cacheKey, tab.filePath)
                  setMainPanelMode('editor')
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  if (cacheKey) closeDiff(cacheKey, tab.filePath)
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
                borderLeft: dropSide === 'left' ? '2px solid var(--t-accent)' : undefined,
                borderRight: dropSide === 'right' ? '2px solid var(--t-accent)' : undefined,
              } : undefined}
            >
              <span className="flex-shrink-0 text-[10px] font-mono font-semibold text-orange-400/80">M</span>
              <FileIcon name={basename(tab.filePath)} size={12} />
              <span className="truncate max-w-40">{basename(tab.filePath)}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  if (cacheKey) closeDiff(cacheKey, tab.filePath)
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
        }
      })}
    </div>
  )
}
