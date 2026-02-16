import { memo, useCallback, useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import type { FileNode } from '../../types'

const EXT_COLORS: Record<string, string> = {
  ts: 'text-blue-400',
  tsx: 'text-blue-400',
  js: 'text-yellow-400',
  jsx: 'text-yellow-400',
  json: 'text-amber-300',
  md: 'text-zinc-400',
  css: 'text-pink-400',
  html: 'text-orange-400',
  py: 'text-green-400',
  rs: 'text-orange-300',
  go: 'text-cyan-400',
}

function getExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_COLORS[ext] ?? 'text-zinc-500'
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

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-zinc-400">
        <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.19a1.5 1.5 0 0 1 1.06.44l.75.75a.5.5 0 0 0 .35.15H13A1.5 1.5 0 0 1 14.5 4.33v.17H3.5a2 2 0 0 0-2 1.94V3zm0 4.44A1 1 0 0 1 2.5 6.5h11a1 1 0 0 1 .98.82l.5 3.5A2 2 0 0 1 13 13H3a2 2 0 0 1-2-1.96l.5-3.6z"/>
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-zinc-400">
      <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.19a1.5 1.5 0 0 1 1.06.44l.75.75a.5.5 0 0 0 .35.15H13A1.5 1.5 0 0 1 14.5 4.33V11A2.5 2.5 0 0 1 12 13.5H4A2.5 2.5 0 0 1 1.5 11V3z"/>
    </svg>
  )
}

function FileIcon({ className }: { className: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={`flex-shrink-0 ${className}`}>
      <path d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V6.62a1.5 1.5 0 0 0-.44-1.06L9.94 2.44A1.5 1.5 0 0 0 8.88 2H4zm5 0v3a1 1 0 0 0 1 1h3"/>
    </svg>
  )
}

export const FileTreeNode = memo(function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const toggleFileTreeExpanded = useProjectStore((s) => s.toggleFileTreeExpanded)
  const openFile = useProjectStore((s) => s.openFile)
  const updateFileTreeChildren = useProjectStore((s) => s.updateFileTreeChildren)

  // Granular selectors — only re-render when this node's derived state actually changes
  const isExpanded = useProjectStore((s) => {
    const cache = activeProjectId ? s.fileTreeCache.get(activeProjectId) : null
    return cache?.expandedPaths.has(node.path) ?? false
  })
  const isSelected = useProjectStore((s) => {
    const cache = activeProjectId ? s.fileTreeCache.get(activeProjectId) : null
    return cache?.selectedFilePath === node.path
  })
  const isChanged = useProjectStore((s) => {
    const cache = activeProjectId ? s.fileTreeCache.get(activeProjectId) : null
    return cache?.recentlyChangedPaths.has(node.path) ?? false
  })

  const [children, setChildren] = useState<FileNode[]>(node.children ?? [])
  const [loaded, setLoaded] = useState(false)

  const handleClick = useCallback(async () => {
    if (!activeProjectId) return
    if (node.type === 'directory') {
      toggleFileTreeExpanded(activeProjectId, node.path)
      if (!loaded && !isExpanded) {
        const nodes = await window.electronAPI.file.readDir(node.path)
        setChildren(nodes)
        updateFileTreeChildren(activeProjectId, node.path, nodes)
        setLoaded(true)
      }
    } else {
      openFile(activeProjectId, node.path)
    }
  }, [node, isExpanded, loaded, activeProjectId, toggleFileTreeExpanded, openFile, updateFileTreeChildren])

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-1 py-[3px] pr-2 cursor-pointer text-[12px] transition-colors ${
          isSelected
            ? 'bg-violet-500/10 text-zinc-200'
            : isChanged
              ? 'bg-amber-500/5 text-amber-300'
              : 'text-zinc-400 hover:bg-[var(--t-bg-hover)] hover:text-zinc-300'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {node.type === 'directory' ? (
          <>
            <span className="text-zinc-500">
              <ChevronIcon expanded={isExpanded} />
            </span>
            <FolderIcon open={isExpanded} />
          </>
        ) : (
          <>
            <span className="w-4 flex-shrink-0" />
            <FileIcon className={getExtColor(node.name)} />
          </>
        )}
        <span className="truncate ml-0.5">{node.name}</span>
      </div>
      {node.type === 'directory' && isExpanded && children.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  )
})
