import { useState } from 'react'
import { GitFileRow } from './GitFileRow'
import { GitFileTree } from './GitFileTree'
import { GitFileGrouped } from './GitFileGrouped'
import { useUIStore } from '../../../stores/uiStore'
import type { GitFileDetail, FileDiffStat } from '../../../types'

interface GitFileSectionProps {
  title: string
  files: GitFileDetail[]
  staged: boolean
  projectId: string
  diffStats: Map<string, FileDiffStat>
  onClick: (filePath: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard?: (paths: string[], statuses: string[]) => void
  actionLabel: string
  onAction: () => void
}

export function GitFileSection({
  title, files, staged, projectId, diffStats, onClick, onStage, onUnstage, onDiscard, actionLabel, onAction,
}: GitFileSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const viewMode = useUIStore((s) => s.gitPanelViewMode)

  return (
    <div className="border-b border-[var(--t-border)]">
      <div
        className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-[var(--t-bg-hover)] transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
            className={`transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}>
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            {title}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono leading-none">
            {files.length}
          </span>
        </div>
        {files.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction() }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1 rounded hover:bg-[var(--t-border)] transition-colors"
            title={actionLabel}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {!collapsed && (
        viewMode === 'tree' ? (
          <GitFileTree
            files={files} staged={staged} projectId={projectId} diffStats={diffStats}
            onClick={onClick} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard}
          />
        ) : viewMode === 'grouped' ? (
          <GitFileGrouped
            files={files} staged={staged} projectId={projectId} diffStats={diffStats}
            onClick={onClick} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard}
          />
        ) : (
          files.map((file) => {
            const rel = file.absolutePath.slice(projectId.length + 1)
            const stat = diffStats.get(rel)
            return (
              <GitFileRow
                key={file.absolutePath}
                file={file} staged={staged} projectId={projectId} diffStat={stat}
                onClick={onClick} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard}
              />
            )
          })
        )
      )}
    </div>
  )
}
