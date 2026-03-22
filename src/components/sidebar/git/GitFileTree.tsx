import { useState, useMemo } from 'react'
import { GitFileRow } from './GitFileRow'
import type { GitFileDetail, FileDiffStat, GitFileStatus } from '../../../types'

const GIT_STATUS_VARS: Record<GitFileStatus, string> = {
  modified: 'var(--t-git-modified)',
  untracked: 'var(--t-git-untracked)',
  added: 'var(--t-git-added)',
  deleted: 'var(--t-git-deleted)',
  conflicted: 'var(--t-git-conflicting)',
  renamed: 'var(--t-git-renamed)',
}

interface TreeNode {
  name: string
  children: Map<string, TreeNode>
  file?: GitFileDetail
}

function buildTree(files: GitFileDetail[], projectId: string): TreeNode {
  const root: TreeNode = { name: '', children: new Map() }
  for (const file of files) {
    const rel = file.absolutePath.slice(projectId.length + 1)
    const parts = rel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) {
        node.children.set(parts[i], { name: parts[i], children: new Map() })
      }
      node = node.children.get(parts[i])!
    }
    const fileName = parts[parts.length - 1]
    const existing = node.children.get(fileName)
    if (existing) {
      existing.file = file
    } else {
      node.children.set(fileName, { name: fileName, children: new Map(), file })
    }
  }
  return root
}

function getTreeStatus(node: TreeNode): GitFileStatus | undefined {
  if (node.file) return node.file.status as GitFileStatus
  for (const child of node.children.values()) {
    const s = getTreeStatus(child)
    if (s) return s
  }
  return undefined
}

interface GitFileTreeProps {
  files: GitFileDetail[]
  staged: boolean
  projectId: string
  diffStats: Map<string, FileDiffStat>
  onClick: (filePath: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard?: (paths: string[], statuses: string[]) => void
}

export function GitFileTree({ files, staged, projectId, diffStats, onClick, onStage, onUnstage, onDiscard }: GitFileTreeProps) {
  const tree = useMemo(() => buildTree(files, projectId), [files, projectId])

  return (
    <div>
      {Array.from(tree.children.values())
        .sort((a, b) => {
          const aDir = a.children.size > 0 && !a.file
          const bDir = b.children.size > 0 && !b.file
          if (aDir && !bDir) return -1
          if (!aDir && bDir) return 1
          return a.name.localeCompare(b.name)
        })
        .map((child) => (
          <TreeNodeView
            key={child.name}
            node={child}
            depth={0}
            staged={staged}
            projectId={projectId}
            diffStats={diffStats}
            onClick={onClick}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        ))}
    </div>
  )
}

function TreeNodeView({
  node, depth, staged, projectId, diffStats, onClick, onStage, onUnstage, onDiscard,
}: {
  node: TreeNode
  depth: number
  staged: boolean
  projectId: string
  diffStats: Map<string, FileDiffStat>
  onClick: (filePath: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard?: (paths: string[], statuses: string[]) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isDir = node.children.size > 0 && !node.file

  if (node.file) {
    const rel = node.file.absolutePath.slice(projectId.length + 1)
    const stat = diffStats.get(rel)
    return (
      <GitFileRow
        file={node.file}
        staged={staged}
        projectId={projectId}
        diffStat={stat}
        onClick={onClick}
        onStage={onStage}
        onUnstage={onUnstage}
        onDiscard={onDiscard}
        indent={depth}
      />
    )
  }

  if (!isDir) return null

  const statusColor = GIT_STATUS_VARS[getTreeStatus(node) as GitFileStatus]

  return (
    <div>
      <div
        className="flex items-center gap-1 px-3 py-[2px] cursor-pointer text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors"
        style={{ paddingLeft: depth * 16 + 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
          className={`transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span style={statusColor ? { color: statusColor } : undefined}>{node.name}</span>
      </div>
      {expanded && Array.from(node.children.values())
        .sort((a, b) => {
          const aDir = a.children.size > 0 && !a.file
          const bDir = b.children.size > 0 && !b.file
          if (aDir && !bDir) return -1
          if (!aDir && bDir) return 1
          return a.name.localeCompare(b.name)
        })
        .map((child) => (
          <TreeNodeView
            key={child.name}
            node={child}
            depth={depth + 1}
            staged={staged}
            projectId={projectId}
            diffStats={diffStats}
            onClick={onClick}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        ))}
    </div>
  )
}
