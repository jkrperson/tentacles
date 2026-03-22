import { useState } from 'react'
import { SplitButton } from './SplitButton'

type CommitMode = 'commit' | 'commitPush' | 'amend'

interface GitCommitAreaProps {
  commitMsg: string
  setCommitMsg: (msg: string) => void
  stagedCount: number
  loading: string | null
  gitBranch: string
  onCommit: () => void
  onCommitAndPush: () => void
  onAmend: () => void
}

const commitOptions = [
  { label: 'Commit', value: 'commit' },
  { label: 'Commit & Push', value: 'commitPush' },
  { label: 'Amend', value: 'amend' },
]

export function GitCommitArea({
  commitMsg, setCommitMsg, stagedCount, loading, gitBranch,
  onCommit, onCommitAndPush, onAmend,
}: GitCommitAreaProps) {
  const [commitMode, setCommitMode] = useState<CommitMode>('commit')

  const handleClick = () => {
    if (commitMode === 'commit') onCommit()
    else if (commitMode === 'commitPush') onCommitAndPush()
    else onAmend()
  }

  const isDisabled = commitMode === 'amend'
    ? !commitMsg.trim() && stagedCount === 0
    : !commitMsg.trim() || stagedCount === 0

  return (
    <div className="px-2 py-2 border-b border-[var(--t-border)]">
      <textarea
        value={commitMsg}
        onChange={(e) => setCommitMsg(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            handleClick()
          }
        }}
        placeholder={`Message (⌘⏎ to commit on "${gitBranch}")`}
        rows={2}
        className="w-full bg-[var(--t-bg-input)] text-zinc-200 text-[12px] px-2 py-1.5 rounded border border-[var(--t-border)] focus:border-[var(--t-accent)] focus:outline-none resize-none"
      />
      <div className="mt-1">
        <SplitButton
          options={commitOptions}
          selectedValue={commitMode}
          onSelect={(v) => setCommitMode(v as CommitMode)}
          onClick={handleClick}
          disabled={isDisabled}
          loading={loading === 'commit' || loading === 'amend'}
          loadingLabel={loading === 'amend' ? 'Amending...' : 'Committing...'}
        />
      </div>
    </div>
  )
}
