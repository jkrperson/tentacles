import { useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { trpc } from '../trpc'
import type { GitStatusDetailResult } from '../types'

/**
 * Centralized file watching + git status polling hook.
 * Must be mounted once at the Layout level so it stays alive
 * regardless of which sidebar tab is active.
 */
export function useFileWatcher() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const setFileTreeNodes = useProjectStore((s) => s.setFileTreeNodes)
  const setGitStatuses = useProjectStore((s) => s.setGitStatuses)
  const addFileTreeChangedPath = useProjectStore((s) => s.addFileTreeChangedPath)
  const removeFileTreeChangedPath = useProjectStore((s) => s.removeFileTreeChangedPath)

  const fetchGitStatus = useCallback((projectId: string) => {
    trpc.git.status.query({ dirPath: projectId }).then((result) => {
      setGitStatuses(projectId, result as GitStatusDetailResult)
    }).catch(() => {
      setGitStatuses(projectId, { branch: '', upstream: null, ahead: 0, behind: 0, files: [] })
    })
  }, [setGitStatuses])

  // Start watching when active project changes.
  // Watchers stay alive across switches (watch is a no-op for
  // already-watched dirs) to avoid expensive teardown/setup.
  useEffect(() => {
    if (!activeProjectId) return
    const existing = useProjectStore.getState().fileTreeCache.get(activeProjectId)
    if (!existing || existing.nodes.length === 0) {
      trpc.file.readDir.query({ dirPath: activeProjectId }).then((rootNodes) => {
        setFileTreeNodes(activeProjectId, rootNodes)
      })
    }
    trpc.file.watch.mutate({ dirPath: activeProjectId })
  }, [activeProjectId, setFileTreeNodes])

  // Poll git status for the active project
  useEffect(() => {
    if (!activeProjectId) return
    fetchGitStatus(activeProjectId)
    const interval = setInterval(() => fetchGitStatus(activeProjectId), 15000)
    return () => clearInterval(interval)
  }, [activeProjectId, fetchGitStatus])

  // Listen for file change events, route to correct project via watchRoot
  const immediateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const sub = trpc.file.onChanged.subscribe(undefined, { onData: (event) => {
      const projectId = event.watchRoot
      if (!projectId) return

      addFileTreeChangedPath(projectId, event.path)
      setTimeout(() => removeFileTreeChangedPath(projectId, event.path), 2000)

      if (
        event.eventType === 'add' || event.eventType === 'unlink' ||
        event.eventType === 'addDir' || event.eventType === 'unlinkDir'
      ) {
        trpc.file.readDir.query({ dirPath: projectId }).then((rootNodes) => {
          setFileTreeNodes(projectId, rootNodes)
        })
      }

      // Debounced immediate git status refresh (500ms)
      if (immediateTimerRef.current) clearTimeout(immediateTimerRef.current)
      immediateTimerRef.current = setTimeout(() => fetchGitStatus(projectId), 500)

      // Trailing git status refresh (2s) to catch transient states
      // from multi-step git operations (e.g., git checkout writes file
      // then restores it — the immediate fetch may see a transient state)
      if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current)
      trailingTimerRef.current = setTimeout(() => fetchGitStatus(projectId), 2000)
    } })
    return () => sub.unsubscribe()
  }, [addFileTreeChangedPath, removeFileTreeChangedPath, setFileTreeNodes, fetchGitStatus])
}
