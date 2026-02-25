import { useState, useMemo, useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useNotificationStore } from '../../stores/notificationStore'
import type { GitFileDetail, GitFileStatus, GitStatusDetailResult } from '../../types'

const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: 'text-amber-300',
  untracked: 'text-green-400',
  added: 'text-green-400',
  deleted: 'text-red-400',
  conflicted: 'text-red-400',
  renamed: 'text-green-400',
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

interface GitPanelProps {
  onToggle: () => void
}

export function GitPanel({ onToggle }: GitPanelProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const cache = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId) ?? null : null
  })
  const setGitStatuses = useProjectStore((s) => s.setGitStatuses)
  const setActiveDiff = useProjectStore((s) => s.setActiveDiff)
  const notify = useNotificationStore((s) => s.notify)

  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [stagedCollapsed, setStagedCollapsed] = useState(false)
  const [changesCollapsed, setChangesCollapsed] = useState(false)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)

  const gitBranch = cache?.gitBranch ?? ''
  const gitAhead = cache?.gitAhead ?? 0
  const gitBehind = cache?.gitBehind ?? 0

  // Split files into staged and unstaged
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const files = cache?.gitDetailedFiles ?? []
    const staged: GitFileDetail[] = []
    const unstaged: GitFileDetail[] = []
    for (const file of files) {
      if (file.indexStatus !== 'none') {
        staged.push(file)
      }
      if (file.workTreeStatus !== 'none') {
        unstaged.push(file)
      }
    }
    return { stagedFiles: staged, unstagedFiles: unstaged }
  }, [cache])

  const refreshStatus = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const result = await window.electronAPI.git.status(activeProjectId)
      setGitStatuses(activeProjectId, result as GitStatusDetailResult)
    } catch {
      // ignore
    }
  }, [activeProjectId, setGitStatuses])

  const handleStage = useCallback(async (paths: string[]) => {
    if (!activeProjectId) return
    setLoading('stage')
    try {
      await window.electronAPI.git.stage(activeProjectId, paths)
      await refreshStatus()
    } catch (err) {
      notify('error', 'Stage failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleUnstage = useCallback(async (paths: string[]) => {
    if (!activeProjectId) return
    setLoading('unstage')
    try {
      await window.electronAPI.git.unstage(activeProjectId, paths)
      await refreshStatus()
    } catch (err) {
      notify('error', 'Unstage failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleCommit = useCallback(async () => {
    if (!activeProjectId || !commitMsg.trim() || stagedFiles.length === 0) return
    setLoading('commit')
    try {
      const result = await window.electronAPI.git.commit(activeProjectId, commitMsg.trim())
      setCommitMsg('')
      await refreshStatus()
      notify('success', 'Committed', result.hash ? `Commit ${result.hash}` : 'Changes committed')
    } catch (err) {
      notify('error', 'Commit failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, commitMsg, stagedFiles.length, refreshStatus, notify])

  const handlePush = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('push')
    try {
      await window.electronAPI.git.push(activeProjectId)
      await refreshStatus()
      notify('success', 'Pushed', 'Changes pushed to remote')
    } catch (err) {
      notify('error', 'Push failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handlePull = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('pull')
    try {
      await window.electronAPI.git.pull(activeProjectId)
      await refreshStatus()
      notify('success', 'Pulled', 'Changes pulled from remote')
    } catch (err) {
      notify('error', 'Pull failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleStash = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('stash')
    try {
      await window.electronAPI.git.stash(activeProjectId)
      await refreshStatus()
      notify('success', 'Stashed', 'Changes stashed')
    } catch (err) {
      notify('error', 'Stash failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleStashPop = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('stashPop')
    try {
      await window.electronAPI.git.stashPop(activeProjectId)
      await refreshStatus()
      notify('success', 'Stash popped', 'Stashed changes restored')
    } catch (err) {
      notify('error', 'Stash pop failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleFetchBranches = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const result = await window.electronAPI.git.branches(activeProjectId)
      setBranches(result.branches)
      setShowBranchMenu(true)
    } catch (err) {
      notify('error', 'Failed to list branches', String(err))
    }
  }, [activeProjectId, notify])

  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (!activeProjectId) return
    setShowBranchMenu(false)
    setLoading('switch')
    try {
      await window.electronAPI.git.switchBranch(activeProjectId, branch)
      await refreshStatus()
      notify('success', 'Branch switched', `Now on ${branch}`)
    } catch (err) {
      notify('error', 'Switch failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus, notify])

  const handleCreateBranch = useCallback(async () => {
    if (!activeProjectId || !newBranchName.trim()) return
    setShowNewBranch(false)
    setLoading('switch')
    try {
      await window.electronAPI.git.createBranch(activeProjectId, newBranchName.trim(), true)
      setNewBranchName('')
      await refreshStatus()
      notify('success', 'Branch created', `Now on ${newBranchName.trim()}`)
    } catch (err) {
      notify('error', 'Create branch failed', String(err))
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, newBranchName, refreshStatus, notify])

  const handleFileClick = useCallback((filePath: string, staged: boolean) => {
    if (!activeProjectId) return
    setActiveDiff(activeProjectId, { filePath, staged })
  }, [activeProjectId, setActiveDiff])

  const renderFileRow = (file: GitFileDetail, staged: boolean) => {
    const fileName = file.absolutePath.split('/').pop() ?? file.absolutePath
    const relativePath = activeProjectId ? file.absolutePath.slice(activeProjectId.length + 1) : file.absolutePath
    const parentDir = relativePath.slice(0, relativePath.lastIndexOf('/'))
    const statusKey = staged ? file.indexStatus : file.workTreeStatus
    const colorClass = GIT_STATUS_COLORS[file.status as GitFileStatus] ?? 'text-zinc-400'
    const letter = GIT_STATUS_LETTER[statusKey] ?? '?'

    return (
      <div
        key={`${file.absolutePath}-${staged ? 's' : 'u'}`}
        className="flex items-center gap-1 px-3 py-[3px] cursor-pointer text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors overflow-hidden group/row"
        onClick={() => handleFileClick(file.absolutePath, staged)}
      >
        <span className={`flex-shrink-0 w-4 text-center font-mono text-[11px] ${colorClass}`}>
          {letter}
        </span>
        <span className={`truncate ${colorClass}`}>
          {fileName}
        </span>
        {parentDir && (
          <span className="text-zinc-600 text-[11px] truncate ml-auto mr-1">
            {parentDir}
          </span>
        )}
        {staged ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleUnstage([file.absolutePath]) }}
            className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-[var(--t-border)] text-zinc-400 hover:text-zinc-200 transition-all"
            title="Unstage"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleStage([file.absolutePath]) }}
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

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--t-border)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex-shrink-0">
            Source Control
          </span>
          {gitBranch && (
            <button
              onClick={handleFetchBranches}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 truncate transition-colors"
              title="Switch branch"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" opacity="0.6"/>
              </svg>
              <span className="truncate">{gitBranch}</span>
            </button>
          )}
          {gitAhead > 0 && (
            <span className="text-[10px] text-zinc-500 flex-shrink-0" title={`${gitAhead} ahead`}>↑{gitAhead}</span>
          )}
          {gitBehind > 0 && (
            <span className="text-[10px] text-zinc-500 flex-shrink-0" title={`${gitBehind} behind`}>↓{gitBehind}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={refreshStatus}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[var(--t-border)] transition-colors"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v4h-4"/>
            </svg>
          </button>
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
      </div>

      {/* Branch dropdown */}
      {showBranchMenu && (
        <div className="border-b border-[var(--t-border)] bg-[var(--t-bg-base)] max-h-48 overflow-y-auto">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--t-border)]">
            <button
              onClick={() => { setShowNewBranch(!showNewBranch); setShowBranchMenu(false) }}
              className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              + New branch
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowBranchMenu(false)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </div>
          {branches.map((branch) => (
            <button
              key={branch}
              onClick={() => handleSwitchBranch(branch)}
              className={`w-full text-left px-3 py-1 text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors ${
                branch === gitBranch ? 'text-violet-400' : 'text-zinc-300'
              }`}
            >
              {branch === gitBranch ? `* ${branch}` : branch}
            </button>
          ))}
        </div>
      )}

      {/* New branch input */}
      {showNewBranch && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-bg-base)]">
          <input
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false) }}
            placeholder="Branch name..."
            className="flex-1 bg-[var(--t-bg-input)] text-zinc-200 text-[12px] px-2 py-1 rounded border border-[var(--t-border)] focus:border-violet-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleCreateBranch}
            disabled={!newBranchName.trim()}
            className="text-[11px] px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => setShowNewBranch(false)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!activeProjectId && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[13px] mb-2">No project selected</div>
            <div className="text-zinc-700 text-[11px]">Add a project to view changes</div>
          </div>
        )}

        {activeProjectId && (
          <>
            {/* Commit input */}
            <div className="px-2 py-2 border-b border-[var(--t-border)]">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    handleCommit()
                  }
                }}
                placeholder="Commit message..."
                rows={2}
                className="w-full bg-[var(--t-bg-input)] text-zinc-200 text-[12px] px-2 py-1.5 rounded border border-[var(--t-border)] focus:border-violet-500 focus:outline-none resize-none"
              />
              <button
                onClick={handleCommit}
                disabled={!commitMsg.trim() || stagedFiles.length === 0 || loading === 'commit'}
                className="w-full mt-1 text-[12px] py-1 rounded bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
              >
                {loading === 'commit' ? 'Committing...' : `Commit (${stagedFiles.length})`}
              </button>
            </div>

            {/* Staged Changes */}
            <div className="border-b border-[var(--t-border)]">
              <div
                className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-[var(--t-bg-hover)] transition-colors"
                onClick={() => setStagedCollapsed(!stagedCollapsed)}
              >
                <div className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                    className={`transition-transform ${stagedCollapsed ? '' : 'rotate-90'}`}>
                    <path d="M6 4l4 4-4 4"/>
                  </svg>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Staged
                  </span>
                  <span className="text-[10px] text-zinc-600">{stagedFiles.length}</span>
                </div>
                {stagedFiles.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUnstage(stagedFiles.map((f) => f.absolutePath)) }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1 rounded hover:bg-[var(--t-border)] transition-colors"
                    title="Unstage all"
                  >
                    Unstage all
                  </button>
                )}
              </div>
              {!stagedCollapsed && stagedFiles.map((file) => renderFileRow(file, true))}
            </div>

            {/* Changes (unstaged + untracked) */}
            <div className="border-b border-[var(--t-border)]">
              <div
                className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-[var(--t-bg-hover)] transition-colors"
                onClick={() => setChangesCollapsed(!changesCollapsed)}
              >
                <div className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                    className={`transition-transform ${changesCollapsed ? '' : 'rotate-90'}`}>
                    <path d="M6 4l4 4-4 4"/>
                  </svg>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Changes
                  </span>
                  <span className="text-[10px] text-zinc-600">{unstagedFiles.length}</span>
                </div>
                {unstagedFiles.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStage(unstagedFiles.map((f) => f.absolutePath)) }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1 rounded hover:bg-[var(--t-border)] transition-colors"
                    title="Stage all"
                  >
                    Stage all
                  </button>
                )}
              </div>
              {!changesCollapsed && unstagedFiles.map((file) => renderFileRow(file, false))}
            </div>

            {/* No changes message */}
            {stagedFiles.length === 0 && unstagedFiles.length === 0 && (
              <div className="text-center py-8 px-4">
                <div className="text-zinc-600 text-[13px]">No changes</div>
              </div>
            )}

            {/* Action bar */}
            <div className="px-2 py-2 flex flex-wrap gap-1">
              <button
                onClick={handlePush}
                disabled={loading === 'push'}
                className="text-[11px] px-2 py-1 rounded bg-[var(--t-bg-base)] border border-[var(--t-border)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
              >
                {loading === 'push' ? 'Pushing...' : 'Push'}
              </button>
              <button
                onClick={handlePull}
                disabled={loading === 'pull'}
                className="text-[11px] px-2 py-1 rounded bg-[var(--t-bg-base)] border border-[var(--t-border)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
              >
                {loading === 'pull' ? 'Pulling...' : 'Pull'}
              </button>
              <button
                onClick={handleStash}
                disabled={loading === 'stash'}
                className="text-[11px] px-2 py-1 rounded bg-[var(--t-bg-base)] border border-[var(--t-border)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
              >
                Stash
              </button>
              <button
                onClick={handleStashPop}
                disabled={loading === 'stashPop'}
                className="text-[11px] px-2 py-1 rounded bg-[var(--t-bg-base)] border border-[var(--t-border)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
              >
                Pop
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
