import { useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { FileTreeNode } from './FileTreeNode'
import type { GitFileStatus } from '../../types'

interface FileTreeProps {
  onToggle: () => void
}

export function FileTree({ onToggle }: FileTreeProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const fileTreeCache = useProjectStore((s) => s.fileTreeCache)
  const setFileTreeNodes = useProjectStore((s) => s.setFileTreeNodes)
  const setGitStatuses = useProjectStore((s) => s.setGitStatuses)
  const addFileTreeChangedPath = useProjectStore((s) => s.addFileTreeChangedPath)
  const removeFileTreeChangedPath = useProjectStore((s) => s.removeFileTreeChangedPath)

  const cache = activeProjectId ? fileTreeCache.get(activeProjectId) : null
  const nodes = cache?.nodes ?? []

  const fetchGitStatus = useCallback((projectId: string) => {
    window.electronAPI.git.status(projectId).then((result) => {
      setGitStatuses(projectId, result.files as Array<{ absolutePath: string; status: GitFileStatus }>)
    }).catch(() => {
      // Not a git repo or git not available — clear statuses
      setGitStatuses(projectId, [])
    })
  }, [setGitStatuses])

  // Load file tree + start watching when active project changes.
  // Watchers stay alive across switches (chokidar.watch is a no-op for
  // already-watched dirs) to avoid expensive teardown/setup on every switch.
  useEffect(() => {
    if (!activeProjectId) return
    // If cache has nodes already, use them (instant switch). Otherwise load from disk.
    const existing = useProjectStore.getState().fileTreeCache.get(activeProjectId)
    if (!existing || existing.nodes.length === 0) {
      window.electronAPI.file.readDir(activeProjectId).then((rootNodes) => {
        setFileTreeNodes(activeProjectId, rootNodes)
      })
    }
    window.electronAPI.file.watch(activeProjectId)
  }, [activeProjectId, setFileTreeNodes])

  // Poll git status for the active project
  useEffect(() => {
    if (!activeProjectId) return
    fetchGitStatus(activeProjectId)
    const interval = setInterval(() => fetchGitStatus(activeProjectId), 3000)
    return () => clearInterval(interval)
  }, [activeProjectId, fetchGitStatus])

  // Listen for file change events, route to correct project via watchRoot
  const gitRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const unsub = window.electronAPI.file.onChanged((event) => {
      const projectId = event.watchRoot
      if (!projectId) return

      addFileTreeChangedPath(projectId, event.path)
      setTimeout(() => removeFileTreeChangedPath(projectId, event.path), 2000)

      if (
        event.eventType === 'add' || event.eventType === 'unlink' ||
        event.eventType === 'addDir' || event.eventType === 'unlinkDir'
      ) {
        window.electronAPI.file.readDir(projectId).then((rootNodes) => {
          setFileTreeNodes(projectId, rootNodes)
        })
      }

      // Debounced git status refresh on file changes
      if (gitRefreshTimerRef.current) clearTimeout(gitRefreshTimerRef.current)
      gitRefreshTimerRef.current = setTimeout(() => fetchGitStatus(projectId), 500)
    })
    return unsub
  }, [addFileTreeChangedPath, removeFileTreeChangedPath, setFileTreeNodes, fetchGitStatus])

  const dirName = activeProjectId?.split('/').pop() ?? ''

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--t-border)] flex-shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          {activeProjectId ? dirName : 'Explorer'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[var(--t-border)] transition-colors"
            title="Hide explorer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.354 3.646a.5.5 0 0 1 0 .708L5.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" transform="scale(-1,1) translate(-16,0)"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {!activeProjectId && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[13px] mb-2">No project selected</div>
            <div className="text-zinc-700 text-[11px]">Add a project to browse files</div>
          </div>
        )}
        {nodes.map((node) => (
          <FileTreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
    </div>
  )
}
