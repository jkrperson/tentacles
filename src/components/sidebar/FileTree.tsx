import { useProjectStore } from '../../stores/projectStore'
import { useActiveWorkspaceDir } from '../../hooks/useActiveWorkspaceDir'
import { FileTreeNode } from './FileTreeNode'

interface FileTreeProps {
  onToggle: () => void
}

export function FileTree({ onToggle }: FileTreeProps) {
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
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--t-border)] flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">
            {activeProjectId ? projectName : 'Explorer'}
          </span>
          {isWorktree && branch && (
            <>
              <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-600 flex-shrink-0">
                <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
              </svg>
              <span className="text-[10px] font-medium text-[var(--t-accent)] truncate" title={branch}>
                {branch}
              </span>
            </>
          )}
        </div>
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
