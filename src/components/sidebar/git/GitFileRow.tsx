import type { GitFileDetail, GitFileStatus, FileDiffStat } from '../../../types'

const GIT_STATUS_VARS: Record<GitFileStatus, string> = {
  modified: 'var(--t-git-modified)',
  untracked: 'var(--t-git-untracked)',
  added: 'var(--t-git-added)',
  deleted: 'var(--t-git-deleted)',
  conflicted: 'var(--t-git-conflicting)',
  renamed: 'var(--t-git-renamed)',
}

const GIT_STATUS_LETTER: Record<string, string> = {
  modified: 'M',
  untracked: 'U',
  added: 'A',
  deleted: 'D',
  conflicted: 'C',
  renamed: 'R',
  none: ' ',
}

interface GitFileRowProps {
  file: GitFileDetail
  staged: boolean
  projectId: string
  diffStat?: FileDiffStat
  onClick: (filePath: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  indent?: number
}

export function GitFileRow({ file, staged, projectId, diffStat, onClick, onStage, onUnstage, indent = 0 }: GitFileRowProps) {
  const fileName = file.absolutePath.split('/').pop() ?? file.absolutePath
  const relativePath = file.absolutePath.slice(projectId.length + 1)
  const parentDir = relativePath.slice(0, relativePath.lastIndexOf('/'))
  const statusKey = staged ? file.indexStatus : file.workTreeStatus
  const statusColor = GIT_STATUS_VARS[file.status as GitFileStatus]
  const letter = GIT_STATUS_LETTER[statusKey] ?? '?'

  return (
    <div
      className="flex items-center gap-1 px-3 py-[3px] cursor-pointer text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors overflow-hidden group/row"
      style={indent > 0 ? { paddingLeft: indent * 16 + 12 } : undefined}
      onClick={() => onClick(file.absolutePath, staged)}
    >
      <span
        className="truncate flex-shrink-1 min-w-0"
        style={statusColor ? { color: statusColor } : undefined}
      >
        {fileName}
      </span>
      {parentDir && indent === 0 && (
        <span className="text-zinc-600 text-[11px] truncate flex-shrink-[2] min-w-0">
          {parentDir}
        </span>
      )}
      <div className="flex-1" />
      {diffStat && (
        <span className="flex-shrink-0 text-[10px] font-mono flex items-center gap-0.5">
          {diffStat.isBinary ? (
            <span className="text-zinc-500">binary</span>
          ) : (
            <>
              {diffStat.insertions > 0 && <span className="text-green-500">+{diffStat.insertions}</span>}
              {diffStat.deletions > 0 && <span className="text-red-500">−{diffStat.deletions}</span>}
              {diffStat.insertions === 0 && diffStat.deletions === 0 && statusKey === 'added' && (
                <span className="text-green-500">new</span>
              )}
            </>
          )}
        </span>
      )}
      <span
        className="flex-shrink-0 w-4 text-center font-mono text-[11px]"
        style={statusColor ? { color: statusColor } : undefined}
      >
        {letter}
      </span>
      {staged ? (
        <button
          onClick={(e) => { e.stopPropagation(); onUnstage([file.absolutePath]) }}
          className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-[var(--t-border)] text-zinc-400 hover:text-zinc-200 transition-all"
          title="Unstage"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onStage([file.absolutePath]) }}
          className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-[var(--t-border)] text-zinc-400 hover:text-zinc-200 transition-all"
          title="Stage"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}
