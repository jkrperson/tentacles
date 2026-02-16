import { useMemo } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import type { GitFileStatus } from '../../types'

const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: 'text-amber-300',
  untracked: 'text-green-400',
  added: 'text-green-400',
  deleted: 'text-red-400',
  conflicted: 'text-red-400',
  renamed: 'text-green-400',
}

const GIT_STATUS_LETTER: Record<GitFileStatus, string> = {
  modified: 'M',
  untracked: 'U',
  added: 'A',
  deleted: 'D',
  conflicted: 'C',
  renamed: 'R',
}

interface GitPanelProps {
  onToggle: () => void
}

export function GitPanel({ onToggle }: GitPanelProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const gitStatuses = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.gitStatuses ?? null : null
  })
  const openFile = useProjectStore((s) => s.openFile)

  const changedFiles = useMemo(() => {
    if (!gitStatuses || !activeProjectId) return []

    // Build set of directory paths (from parent propagation) to filter them out
    const dirPaths = new Set<string>()
    for (const path of gitStatuses.keys()) {
      let dir = path.slice(0, path.lastIndexOf('/'))
      while (dir.length >= activeProjectId.length) {
        dirPaths.add(dir)
        dir = dir.slice(0, dir.lastIndexOf('/'))
      }
    }

    return Array.from(gitStatuses.entries())
      .filter(([path]) => !dirPaths.has(path))
      .map(([path, status]) => ({ path, status }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [gitStatuses, activeProjectId])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--t-border)] flex-shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          Source Control
        </span>
        <button
          onClick={onToggle}
          className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[var(--t-border)] transition-colors"
          title="Hide sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.354 3.646a.5.5 0 0 1 0 .708L5.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" transform="scale(-1,1) translate(-16,0)"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {!activeProjectId && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[13px] mb-2">No project selected</div>
            <div className="text-zinc-700 text-[11px]">Add a project to view changes</div>
          </div>
        )}
        {activeProjectId && changedFiles.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[13px]">No changes</div>
          </div>
        )}
        {activeProjectId && changedFiles.map(({ path, status }) => {
          const fileName = path.split('/').pop() ?? path
          const relativePath = path.slice(activeProjectId.length + 1)
          const parentDir = relativePath.slice(0, relativePath.lastIndexOf('/'))

          return (
            <div
              key={path}
              onClick={() => openFile(activeProjectId, path)}
              className="flex items-center gap-2 px-3 py-[3px] cursor-pointer text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors overflow-hidden"
            >
              <span className={`flex-shrink-0 w-4 text-center font-mono text-[11px] ${GIT_STATUS_COLORS[status]}`}>
                {GIT_STATUS_LETTER[status]}
              </span>
              <span className={`truncate ${GIT_STATUS_COLORS[status]}`}>
                {fileName}
              </span>
              {parentDir && (
                <span className="text-zinc-600 text-[11px] truncate ml-auto">
                  {parentDir}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
