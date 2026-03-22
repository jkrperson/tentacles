import { useMemo } from 'react'
import { GitFileRow } from './GitFileRow'
import type { GitFileDetail, FileDiffStat } from '../../../types'

interface GitFileGroupedProps {
  files: GitFileDetail[]
  staged: boolean
  projectId: string
  diffStats: Map<string, FileDiffStat>
  onClick: (filePath: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard?: (paths: string[], statuses: string[]) => void
}

export function GitFileGrouped({ files, staged, projectId, diffStats, onClick, onStage, onUnstage, onDiscard }: GitFileGroupedProps) {
  const groups = useMemo(() => {
    const map = new Map<string, GitFileDetail[]>()
    for (const file of files) {
      const rel = file.absolutePath.slice(projectId.length + 1)
      const lastSlash = rel.lastIndexOf('/')
      const dir = lastSlash === -1 ? '.' : rel.slice(0, lastSlash)
      if (!map.has(dir)) map.set(dir, [])
      map.get(dir)!.push(file)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [files, projectId])

  return (
    <div>
      {groups.map(([dir, groupFiles]) => (
        <div key={dir}>
          <div className="flex items-center justify-between px-3 py-[2px] text-[11px] text-zinc-500">
            <span className="truncate font-mono">{dir}</span>
            <span className="flex-shrink-0 text-zinc-600 ml-2">({groupFiles.length})</span>
          </div>
          {groupFiles.map((file) => {
            const rel = file.absolutePath.slice(projectId.length + 1)
            const stat = diffStats.get(rel)
            return (
              <GitFileRow
                key={file.absolutePath}
                file={file}
                staged={staged}
                projectId={projectId}
                diffStat={stat}
                onClick={onClick}
                onStage={onStage}
                onUnstage={onUnstage}
                onDiscard={onDiscard}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
