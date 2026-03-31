import { memo, useCallback, useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useActiveWorkspaceDir } from '../../hooks/useActiveWorkspaceDir'
import { trpc } from '../../trpc'
import { FileIcon } from '../common/FileIcon'
import type { FileNode, GitFileStatus } from '../../types'

const GIT_STATUS_VARS: Record<GitFileStatus, string> = {
  modified: 'var(--t-git-modified)',
  untracked: 'var(--t-git-untracked)',
  added: 'var(--t-git-added)',
  deleted: 'var(--t-git-deleted)',
  conflicted: 'var(--t-git-conflicting)',
  renamed: 'var(--t-git-renamed)',
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
      className={`flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
    >
      <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
    </svg>
  )
}

export const FileTreeNode = memo(function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { dir: workspaceDir } = useActiveWorkspaceDir()
  const toggleFileTreeExpanded = useProjectStore((s) => s.toggleFileTreeExpanded)
  const openFile = useProjectStore((s) => s.openFile)
  const updateFileTreeChildren = useProjectStore((s) => s.updateFileTreeChildren)

  // Use workspace dir for cache lookup (falls back to project root for main)
  const cacheKey = workspaceDir ?? activeProjectId

  // Granular selectors — only re-render when this node's derived state actually changes
  const isExpanded = useProjectStore((s) => {
    const cache = cacheKey ? s.fileTreeCache.get(cacheKey) : null
    return cache?.expandedPaths.has(node.path) ?? false
  })
  const isSelected = useProjectStore((s) => {
    const cache = cacheKey ? s.fileTreeCache.get(cacheKey) : null
    return cache?.selectedFilePath === node.path
  })
  const isChanged = useProjectStore((s) => {
    const cache = cacheKey ? s.fileTreeCache.get(cacheKey) : null
    return cache?.recentlyChangedPaths.has(node.path) ?? false
  })
  const gitStatus = useProjectStore((s) => {
    const cache = cacheKey ? s.fileTreeCache.get(cacheKey) : null
    return cache?.gitStatuses?.get(node.path) ?? null
  })

  const [children, setChildren] = useState<FileNode[]>(node.children ?? [])
  const [loaded, setLoaded] = useState(false)

  const handleClick = useCallback(async () => {
    if (!cacheKey) return
    if (node.type === 'directory') {
      toggleFileTreeExpanded(cacheKey, node.path)
      if (!loaded && !isExpanded) {
        const nodes = await trpc.file.readDir.query({ dirPath: node.path })
        setChildren(nodes)
        updateFileTreeChildren(cacheKey, node.path, nodes)
        setLoaded(true)
      }
    } else {
      openFile(cacheKey, node.path)
    }
  }, [node, isExpanded, loaded, cacheKey, toggleFileTreeExpanded, openFile, updateFileTreeChildren])

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-1 py-[3px] pr-2 cursor-pointer text-[12px] transition-colors ${
          isSelected
            ? 'bg-[var(--t-accent)]/10 text-zinc-200'
            : isChanged
              ? 'bg-amber-500/5 text-zinc-400'
              : 'text-zinc-400 hover:bg-[var(--t-bg-hover)] hover:text-zinc-300'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {node.type === 'directory' ? (
          <>
            <span className="text-zinc-500">
              <ChevronIcon expanded={isExpanded} />
            </span>
            <FileIcon name={node.name} isDirectory isExpanded={isExpanded} />
          </>
        ) : (
          <>
            <span className="w-4 flex-shrink-0" />
            <FileIcon name={node.name} />
          </>
        )}
        <span
          className="truncate ml-0.5"
          style={!isSelected && gitStatus ? { color: GIT_STATUS_VARS[gitStatus] } : undefined}
        >{node.name}</span>
      </div>
      {node.type === 'directory' && isExpanded && children.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  )
})
