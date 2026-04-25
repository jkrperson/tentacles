import { useProjectStore } from '../../stores/projectStore'
import { useActiveWorkspaceDir } from '../../hooks/useActiveWorkspaceDir'
import { FileTreeNode } from './FileTreeNode'

export function FileTree() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const fileTreeCache = useProjectStore((s) => s.fileTreeCache)
  const { dir: workspaceDir, branch, isWorktree } = useActiveWorkspaceDir()

  // Use workspace dir for cache lookup (falls back to project root for main)
  const cacheKey = workspaceDir ?? activeProjectId
  const cache = cacheKey ? fileTreeCache.get(cacheKey) ?? null : null
  const nodes = cache?.nodes ?? []

  const projectName = activeProjectId?.split('/').pop() ?? ''

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--t-hairline)] flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-[0.18em] truncate">
            {activeProjectId ? projectName : 'Explorer'}
          </span>
          {isWorktree && branch && (
            <>
              <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--t-text-faint)] flex-shrink-0">
                <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
              </svg>
              <span className="text-[10px] font-medium text-[var(--t-accent)] truncate" title={branch}>
                {branch}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {!activeProjectId && (
          <div className="text-center py-12 px-4">
            <div className="text-[var(--t-text-muted)] text-[13px] mb-2">No project selected</div>
            <div className="text-[var(--t-text-faint)] text-[11px]">Add a project to browse files</div>
          </div>
        )}
        {nodes.map((node) => (
          <FileTreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
    </div>
  )
}
