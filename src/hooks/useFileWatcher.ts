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
  const updateFileTreeChildren = useProjectStore((s) => s.updateFileTreeChildren)
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

  const scheduleDirRefresh = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const immediateGitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const trailingGitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const queueDirectoryRefresh = useCallback((watchRoot: string, dirToRefresh: string) => {
    const key = `${watchRoot}:${dirToRefresh}`
    const existing = scheduleDirRefresh.current.get(key)
    if (existing) clearTimeout(existing)

    scheduleDirRefresh.current.set(key, setTimeout(() => {
      scheduleDirRefresh.current.delete(key)
      trpc.file.readDir.query({ dirPath: dirToRefresh }).then((nodes) => {
        if (dirToRefresh === watchRoot) {
          setFileTreeNodes(watchRoot, nodes)
        } else {
          updateFileTreeChildren(watchRoot, dirToRefresh, nodes)
        }
      }).catch(() => {})
    }, 120))
  }, [setFileTreeNodes, updateFileTreeChildren])

  const queueGitStatusRefresh = useCallback((
    dirPath: string,
    delayMs: number,
    timers: { current: Map<string, ReturnType<typeof setTimeout>> },
  ) => {
    const existing = timers.current.get(dirPath)
    if (existing) clearTimeout(existing)
    timers.current.set(dirPath, setTimeout(() => {
      timers.current.delete(dirPath)
      fetchGitStatus(dirPath)
    }, delayMs))
  }, [fetchGitStatus])

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
  useEffect(() => {
    const dirRefreshTimers = scheduleDirRefresh.current
    const immediateTimers = immediateGitTimers.current
    const trailingTimers = trailingGitTimers.current

    const sub = trpc.file.onChanged.subscribe(undefined, { onData: (event) => {
      const dirPath = event.watchRoot
      if (!dirPath) return

      addFileTreeChangedPath(dirPath, event.path)
      setTimeout(() => removeFileTreeChangedPath(dirPath, event.path), 2000)

      if (
        event.eventType === 'add' ||
        event.eventType === 'unlink' ||
        event.eventType === 'addDir' ||
        event.eventType === 'unlinkDir'
      ) {
        const lastSlash = event.path.lastIndexOf('/')
        const parentDir = lastSlash > 0 ? event.path.slice(0, lastSlash) : dirPath
        const cache = useProjectStore.getState().fileTreeCache.get(dirPath)

        if (parentDir === dirPath) {
          queueDirectoryRefresh(dirPath, dirPath)
        } else if (cache?.expandedPaths.has(parentDir)) {
          queueDirectoryRefresh(dirPath, parentDir)
        }
      }

      // Fast git status refresh so Source Control feels immediate after writes.
      queueGitStatusRefresh(dirPath, 150, immediateGitTimers)

      // Trailing git status refresh (2s) to catch transient states
      // from multi-step git operations (e.g., git checkout writes file
      // then restores it — the immediate fetch may see a transient state)
      queueGitStatusRefresh(dirPath, 900, trailingGitTimers)
    } })
    return () => {
      sub.unsubscribe()
      for (const timer of dirRefreshTimers.values()) clearTimeout(timer)
      for (const timer of immediateTimers.values()) clearTimeout(timer)
      for (const timer of trailingTimers.values()) clearTimeout(timer)
      dirRefreshTimers.clear()
      immediateTimers.clear()
      trailingTimers.clear()
    }
  }, [addFileTreeChangedPath, removeFileTreeChangedPath, queueDirectoryRefresh, queueGitStatusRefresh])
}
