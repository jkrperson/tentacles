import { useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { trpc } from '../trpc'
import { useActiveWorkspaceDir } from './useActiveWorkspaceDir'
import type { GitStatusDetailResult } from '../types'

/**
 * Centralized file watching + git status polling hook.
 * Must be mounted once at the Layout level so it stays alive
 * regardless of which sidebar tab is active.
 *
 * Watches the active workspace directory (worktree path or project root),
 * so the file tree and git panel reflect the correct workspace.
 */
export function useFileWatcher() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { dir: activeWorkspaceDir } = useActiveWorkspaceDir()
  const setFileTreeNodes = useProjectStore((s) => s.setFileTreeNodes)
  const setGitStatuses = useProjectStore((s) => s.setGitStatuses)
  const ensureFileTreeCache = useProjectStore((s) => s.ensureFileTreeCache)
  const addFileTreeChangedPath = useProjectStore((s) => s.addFileTreeChangedPath)
  const removeFileTreeChangedPath = useProjectStore((s) => s.removeFileTreeChangedPath)

  // The directory to watch and poll: workspace dir if available, otherwise project root
  const watchDir = activeWorkspaceDir ?? activeProjectId

  const fetchGitStatus = useCallback((dirPath: string) => {
    trpc.git.status.query({ dirPath }).then((result) => {
      setGitStatuses(dirPath, result as GitStatusDetailResult)
    }).catch(() => {
      setGitStatuses(dirPath, { branch: '', upstream: null, ahead: 0, behind: 0, files: [] })
    })
  }, [setGitStatuses])

  // Start watching when active workspace dir changes.
  // Watchers stay alive across switches (watch is a no-op for
  // already-watched dirs) to avoid expensive teardown/setup.
  useEffect(() => {
    if (!watchDir) return
    // Ensure a cache entry exists for this directory (important for worktrees)
    ensureFileTreeCache(watchDir)
    const existing = useProjectStore.getState().fileTreeCache.get(watchDir)
    if (!existing || existing.nodes.length === 0) {
      trpc.file.readDir.query({ dirPath: watchDir }).then((rootNodes) => {
        setFileTreeNodes(watchDir, rootNodes)
      })
    }
    trpc.file.watch.mutate({ dirPath: watchDir })
  }, [watchDir, setFileTreeNodes, ensureFileTreeCache])

  // Also watch the project root if it differs from workspace dir
  // (so project-level events still come through)
  useEffect(() => {
    if (!activeProjectId || activeProjectId === watchDir) return
    trpc.file.watch.mutate({ dirPath: activeProjectId })
  }, [activeProjectId, watchDir])

  // Poll git status for the active workspace dir
  useEffect(() => {
    if (!watchDir) return
    fetchGitStatus(watchDir)
    const interval = setInterval(() => fetchGitStatus(watchDir), 15000)
    return () => clearInterval(interval)
  }, [watchDir, fetchGitStatus])

  // Listen for file change events, route to correct directory via watchRoot
  const immediateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const sub = trpc.file.onChanged.subscribe(undefined, { onData: (event) => {
      const dirPath = event.watchRoot
      if (!dirPath) return

      addFileTreeChangedPath(dirPath, event.path)
      setTimeout(() => removeFileTreeChangedPath(dirPath, event.path), 2000)

      if (
        event.eventType === 'add' || event.eventType === 'unlink' ||
        event.eventType === 'addDir' || event.eventType === 'unlinkDir'
      ) {
        trpc.file.readDir.query({ dirPath }).then((rootNodes) => {
          setFileTreeNodes(dirPath, rootNodes)
        })
      }

      // Debounced immediate git status refresh (500ms)
      if (immediateTimerRef.current) clearTimeout(immediateTimerRef.current)
      immediateTimerRef.current = setTimeout(() => fetchGitStatus(dirPath), 500)

      // Trailing git status refresh (2s) to catch transient states
      // from multi-step git operations (e.g., git checkout writes file
      // then restores it — the immediate fetch may see a transient state)
      if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current)
      trailingTimerRef.current = setTimeout(() => fetchGitStatus(dirPath), 2000)
    } })
    return () => sub.unsubscribe()
  }, [addFileTreeChangedPath, removeFileTreeChangedPath, setFileTreeNodes, fetchGitStatus])
}
