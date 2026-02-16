import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'

const execFileAsync = promisify(execFile)

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
}

export class GitManager {
  async isRepo(dirPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: dirPath,
        timeout: 3000,
      })
      return true
    } catch {
      return false
    }
  }

  async createWorktree(repoPath: string, name?: string): Promise<{ worktreePath: string; branch: string }> {
    const slug = name
      ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : ''
    const branch = slug ? `agent/${slug}` : `agent-${Date.now()}`
    const worktreeDir = path.join(repoPath, '.worktrees', slug || `agent-${Date.now()}`)

    await execFileAsync('git', ['worktree', 'add', worktreeDir, '-b', branch], {
      cwd: repoPath,
      timeout: 10000,
    })

    return { worktreePath: worktreeDir, branch }
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    try {
      await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: repoPath,
        timeout: 10000,
      })
    } catch {
      // worktree may already be gone
    }
    try {
      await execFileAsync('git', ['worktree', 'prune'], {
        cwd: repoPath,
        timeout: 5000,
      })
    } catch {
      // ignore prune errors
    }
  }

  async status(repoPath: string): Promise<{ branch: string; files: Array<{ absolutePath: string; status: string }> }> {
    // Get current branch
    let branch = ''
    try {
      const branchResult = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoPath,
        timeout: 3000,
      })
      branch = branchResult.stdout.trim()
    } catch {
      // detached HEAD or not a repo
    }

    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: repoPath,
      timeout: 5000,
    })

    const files: Array<{ absolutePath: string; status: string }> = []

    for (const line of stdout.split('\n')) {
      if (!line || line.length < 4) continue

      const x = line[0] // index status
      const y = line[1] // worktree status
      let filePath = line.slice(3)

      // Handle renames: "R  old -> new"
      const arrowIdx = filePath.indexOf(' -> ')
      if (arrowIdx !== -1) {
        filePath = filePath.slice(arrowIdx + 4)
      }

      let status: string
      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        status = 'conflicted'
      } else if (x === 'R' || y === 'R') {
        status = 'renamed'
      } else if (x === 'D' || y === 'D') {
        status = 'deleted'
      } else if (x === '?' && y === '?') {
        status = 'untracked'
      } else if (x === 'A' || y === 'A') {
        status = 'added'
      } else {
        status = 'modified'
      }

      const absolutePath = path.resolve(repoPath, filePath)
      files.push({ absolutePath, status })
    }

    return { branch, files }
  }

  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      timeout: 5000,
    })

    const worktrees: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}

    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        current.path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice('branch '.length).replace('refs/heads/', '')
      } else if (line === '') {
        if (current.path && current.branch && current.commit) {
          worktrees.push(current as WorktreeInfo)
        }
        current = {}
      }
    }

    return worktrees
  }
}
