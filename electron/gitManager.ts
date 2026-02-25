import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'

const execFileAsync = promisify(execFile)

export type GitIndexStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'none'
export type GitWorkTreeStatus = 'modified' | 'deleted' | 'untracked' | 'none'

export interface GitFileDetail {
  absolutePath: string
  status: string // combined status for backward compat
  indexStatus: GitIndexStatus
  workTreeStatus: GitWorkTreeStatus
}

export interface GitStatusDetailResult {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileDetail[]
}

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

  async status(repoPath: string): Promise<GitStatusDetailResult> {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--branch'], {
      cwd: repoPath,
      timeout: 5000,
    })

    let branch = ''
    let upstream: string | null = null
    let ahead = 0
    let behind = 0
    const files: GitFileDetail[] = []

    for (const line of stdout.split('\n')) {
      if (!line) continue

      // Parse branch header: ## branch...upstream [ahead N, behind N]
      if (line.startsWith('## ')) {
        const header = line.slice(3)
        const bracketIdx = header.indexOf(' [')
        const branchPart = bracketIdx !== -1 ? header.slice(0, bracketIdx) : header
        const dotIdx = branchPart.indexOf('...')
        if (dotIdx !== -1) {
          branch = branchPart.slice(0, dotIdx)
          upstream = branchPart.slice(dotIdx + 3)
        } else {
          branch = branchPart
        }
        if (bracketIdx !== -1) {
          const info = header.slice(bracketIdx + 2, header.indexOf(']'))
          const aheadMatch = info.match(/ahead (\d+)/)
          const behindMatch = info.match(/behind (\d+)/)
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
          if (behindMatch) behind = parseInt(behindMatch[1], 10)
        }
        continue
      }

      if (line.length < 4) continue
      const x = line[0] // index status
      const y = line[1] // worktree status
      let filePath = line.slice(3)

      // Handle renames: "R  old -> new"
      const arrowIdx = filePath.indexOf(' -> ')
      if (arrowIdx !== -1) {
        filePath = filePath.slice(arrowIdx + 4)
      }

      // Parse index status (X column)
      let indexStatus: GitIndexStatus = 'none'
      if (x === 'A') indexStatus = 'added'
      else if (x === 'M') indexStatus = 'modified'
      else if (x === 'D') indexStatus = 'deleted'
      else if (x === 'R') indexStatus = 'renamed'

      // Parse worktree status (Y column)
      let workTreeStatus: GitWorkTreeStatus = 'none'
      if (x === '?' && y === '?') workTreeStatus = 'untracked'
      else if (y === 'M') workTreeStatus = 'modified'
      else if (y === 'D') workTreeStatus = 'deleted'

      // Combined status for backward compat with file tree coloring
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
      files.push({ absolutePath, status, indexStatus, workTreeStatus })
    }

    return { branch, upstream, ahead, behind, files }
  }

  async stage(repoPath: string, paths: string[]): Promise<void> {
    await execFileAsync('git', ['add', '--', ...paths], {
      cwd: repoPath,
      timeout: 5000,
    })
  }

  async unstage(repoPath: string, paths: string[]): Promise<void> {
    await execFileAsync('git', ['reset', 'HEAD', '--', ...paths], {
      cwd: repoPath,
      timeout: 5000,
    })
  }

  async commit(repoPath: string, message: string): Promise<{ hash: string }> {
    const { stdout } = await execFileAsync('git', ['commit', '-m', message], {
      cwd: repoPath,
      timeout: 10000,
    })
    // Parse short hash from "[ branch hash] message" output
    const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/)
    return { hash: match?.[1] ?? '' }
  }

  async push(repoPath: string): Promise<void> {
    await execFileAsync('git', ['push'], {
      cwd: repoPath,
      timeout: 30000,
    })
  }

  async pull(repoPath: string): Promise<void> {
    await execFileAsync('git', ['pull'], {
      cwd: repoPath,
      timeout: 30000,
    })
  }

  async listBranches(repoPath: string): Promise<{ branches: string[]; current: string }> {
    const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
      timeout: 5000,
    })
    const branches = stdout.split('\n').filter(Boolean)

    let current = ''
    try {
      const result = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoPath,
        timeout: 3000,
      })
      current = result.stdout.trim()
    } catch {
      // detached HEAD
    }

    return { branches, current }
  }

  async switchBranch(repoPath: string, branch: string): Promise<void> {
    await execFileAsync('git', ['checkout', branch], {
      cwd: repoPath,
      timeout: 10000,
    })
  }

  async createBranch(repoPath: string, name: string, checkout?: boolean): Promise<void> {
    if (checkout) {
      await execFileAsync('git', ['checkout', '-b', name], {
        cwd: repoPath,
        timeout: 5000,
      })
    } else {
      await execFileAsync('git', ['branch', name], {
        cwd: repoPath,
        timeout: 5000,
      })
    }
  }

  async stash(repoPath: string, message?: string): Promise<void> {
    const args = ['stash', 'push']
    if (message) args.push('-m', message)
    await execFileAsync('git', args, {
      cwd: repoPath,
      timeout: 10000,
    })
  }

  async stashPop(repoPath: string): Promise<void> {
    await execFileAsync('git', ['stash', 'pop'], {
      cwd: repoPath,
      timeout: 10000,
    })
  }

  async showFile(repoPath: string, ref: string, filePath: string): Promise<string> {
    const relPath = path.relative(repoPath, filePath)
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${relPath}`], {
      cwd: repoPath,
      timeout: 5000,
    })
    return stdout
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
