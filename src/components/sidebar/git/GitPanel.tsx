import { useState, useMemo, useCallback, useEffect } from 'react'
import { useProjectStore } from '../../../stores/projectStore'
import { trpc } from '../../../trpc'
import { GitPanelHeader } from './GitPanelHeader'
import { GitCommitArea } from './GitCommitArea'
import { GitFileSection } from './GitFileSection'
import type { GitFileDetail, GitStatusDetailResult, FileDiffStat } from '../../../types'

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
  const setGitDiffStats = useProjectStore((s) => s.setGitDiffStats)
  const setActiveDiff = useProjectStore((s) => s.setActiveDiff)
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)

  const gitBranch = cache?.gitBranch ?? ''
  const gitAhead = cache?.gitAhead ?? 0
  const gitBehind = cache?.gitBehind ?? 0
  const diffStats = cache?.gitDiffStats ?? new Map<string, FileDiffStat>()

  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const files = cache?.gitDetailedFiles ?? []
    const staged: GitFileDetail[] = []
    const unstaged: GitFileDetail[] = []
    for (const file of files) {
      if (file.indexStatus !== 'none') staged.push(file)
      if (file.workTreeStatus !== 'none') unstaged.push(file)
    }
    return { stagedFiles: staged, unstagedFiles: unstaged }
  }, [cache])

  const fetchDiffStats = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const result = await trpc.git.diffNumstat.query({ repoPath: activeProjectId })
      const map = new Map<string, FileDiffStat>()
      for (const s of [...result.staged, ...result.unstaged]) {
        map.set(s.filePath, s)
      }
      setGitDiffStats(activeProjectId, map)
    } catch {
      // ignore
    }
  }, [activeProjectId, setGitDiffStats])

  const refreshStatus = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const [result] = await Promise.all([
        trpc.git.status.query({ dirPath: activeProjectId }),
        fetchDiffStats(),
      ])
      setGitStatuses(activeProjectId, result as GitStatusDetailResult)
    } catch {
      // ignore
    }
  }, [activeProjectId, setGitStatuses, fetchDiffStats])

  // Fetch diff stats on mount
  useEffect(() => {
    fetchDiffStats()
  }, [fetchDiffStats])

  const handleStage = useCallback(async (paths: string[]) => {
    if (!activeProjectId) return
    setLoading('stage')
    try {
      await trpc.git.stage.mutate({ repoPath: activeProjectId, paths })
      await refreshStatus()
    } catch (err) {
      console.error('Stage failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleUnstage = useCallback(async (paths: string[]) => {
    if (!activeProjectId) return
    setLoading('unstage')
    try {
      await trpc.git.unstage.mutate({ repoPath: activeProjectId, paths })
      await refreshStatus()
    } catch (err) {
      console.error('Unstage failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleCommit = useCallback(async () => {
    if (!activeProjectId || !commitMsg.trim() || stagedFiles.length === 0) return
    setLoading('commit')
    try {
      await trpc.git.commit.mutate({ repoPath: activeProjectId, message: commitMsg.trim() })
      setCommitMsg('')
      await refreshStatus()
    } catch (err) {
      console.error('Commit failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, commitMsg, stagedFiles.length, refreshStatus])

  const handleCommitAndPush = useCallback(async () => {
    if (!activeProjectId || !commitMsg.trim() || stagedFiles.length === 0) return
    setLoading('commit')
    try {
      await trpc.git.commit.mutate({ repoPath: activeProjectId, message: commitMsg.trim() })
      setCommitMsg('')
      await trpc.git.push.mutate({ repoPath: activeProjectId })
      await refreshStatus()
    } catch (err) {
      console.error('Commit & push failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, commitMsg, stagedFiles.length, refreshStatus])

  const handleAmend = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('amend')
    try {
      const msg = commitMsg.trim() || undefined
      await trpc.git.amendCommit.mutate({ repoPath: activeProjectId, message: msg })
      setCommitMsg('')
      await refreshStatus()
    } catch (err) {
      console.error('Amend failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, commitMsg, refreshStatus])

  const handlePush = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('push')
    try {
      await trpc.git.push.mutate({ repoPath: activeProjectId })
      await refreshStatus()
    } catch (err) {
      console.error('Push failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handlePull = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('pull')
    try {
      await trpc.git.pull.mutate({ repoPath: activeProjectId })
      await refreshStatus()
    } catch (err) {
      console.error('Pull failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleStash = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('stash')
    try {
      await trpc.git.stash.mutate({ repoPath: activeProjectId })
      await refreshStatus()
    } catch (err) {
      console.error('Stash failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleStashPop = useCallback(async () => {
    if (!activeProjectId) return
    setLoading('stashPop')
    try {
      await trpc.git.stashPop.mutate({ repoPath: activeProjectId })
      await refreshStatus()
    } catch (err) {
      console.error('Stash pop failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleFetchBranches = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const result = await trpc.git.branches.query({ repoPath: activeProjectId })
      setBranches(result.branches)
      setShowBranchMenu(true)
    } catch (err) {
      console.error('Failed to list branches', err)
    }
  }, [activeProjectId])

  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (!activeProjectId) return
    setShowBranchMenu(false)
    setLoading('switch')
    try {
      await trpc.git.switchBranch.mutate({ repoPath: activeProjectId, branch })
      await refreshStatus()
    } catch (err) {
      console.error('Switch failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, refreshStatus])

  const handleCreateBranch = useCallback(async () => {
    if (!activeProjectId || !newBranchName.trim()) return
    setShowNewBranch(false)
    setLoading('switch')
    try {
      await trpc.git.createBranch.mutate({ repoPath: activeProjectId, name: newBranchName.trim(), checkout: true })
      setNewBranchName('')
      await refreshStatus()
    } catch (err) {
      console.error('Create branch failed', err)
    } finally {
      setLoading(null)
    }
  }, [activeProjectId, newBranchName, refreshStatus])

  const handleFileClick = useCallback((filePath: string, staged: boolean) => {
    if (!activeProjectId) return
    setActiveDiff(activeProjectId, { filePath, staged })
  }, [activeProjectId, setActiveDiff])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      <GitPanelHeader
        gitBranch={gitBranch}
        gitAhead={gitAhead}
        gitBehind={gitBehind}
        loading={loading}
        onFetchBranches={handleFetchBranches}
        onRefresh={refreshStatus}
        onPush={handlePush}
        onPull={handlePull}
        onStash={handleStash}
        onStashPop={handleStashPop}
        onToggle={onToggle}
      />

      {/* Branch dropdown */}
      {showBranchMenu && (
        <div className="border-b border-[var(--t-border)] bg-[var(--t-bg-base)] max-h-48 overflow-y-auto">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--t-border)]">
            <button
              onClick={() => { setShowNewBranch(!showNewBranch); setShowBranchMenu(false) }}
              className="text-[11px] text-[var(--t-accent)] hover:text-[var(--t-accent-hover)] transition-colors"
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
                branch === gitBranch ? 'text-[var(--t-accent)]' : 'text-zinc-300'
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
            className="flex-1 bg-[var(--t-bg-input)] text-zinc-200 text-[12px] px-2 py-1 rounded border border-[var(--t-border)] focus:border-[var(--t-accent)] focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleCreateBranch}
            disabled={!newBranchName.trim()}
            className="text-[11px] px-2 py-1 rounded bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white disabled:opacity-40 transition-colors"
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
            <GitCommitArea
              commitMsg={commitMsg}
              setCommitMsg={setCommitMsg}
              stagedCount={stagedFiles.length}
              loading={loading}
              gitBranch={gitBranch}
              onCommit={handleCommit}
              onCommitAndPush={handleCommitAndPush}
              onAmend={handleAmend}
            />

            {/* Staged Changes — hidden when empty */}
            {stagedFiles.length > 0 && (
              <GitFileSection
                title="Staged"
                files={stagedFiles}
                staged={true}
                projectId={activeProjectId}
                diffStats={diffStats}
                onClick={handleFileClick}
                onStage={handleStage}
                onUnstage={handleUnstage}
                actionLabel="Unstage all"
                onAction={() => handleUnstage(stagedFiles.map((f) => f.absolutePath))}
              />
            )}

            {/* Changes (unstaged + untracked) */}
            <GitFileSection
              title="Changes"
              files={unstagedFiles}
              staged={false}
              projectId={activeProjectId}
              diffStats={diffStats}
              onClick={handleFileClick}
              onStage={handleStage}
              onUnstage={handleUnstage}
              actionLabel="Stage all"
              onAction={() => handleStage(unstagedFiles.map((f) => f.absolutePath))}
            />

            {/* No changes message */}
            {stagedFiles.length === 0 && unstagedFiles.length === 0 && (
              <div className="text-center py-8 px-4">
                <div className="text-zinc-600 text-[13px]">No changes</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
