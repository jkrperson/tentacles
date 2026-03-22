import { useState, useCallback, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { getErrorMessage } from '../../utils/errors'

interface WorktreeCreateDialogProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

export function WorktreeCreateDialog({ projectId, isOpen, onClose }: WorktreeCreateDialogProps) {
  const createWorktreeWorkspace = useWorkspaceStore((s) => s.createWorktreeWorkspace)

  const [branchName, setBranchName] = useState('')
  const [creating, setCreating] = useState(false)

  const sanitize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBranchName('')
      setCreating(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      await createWorktreeWorkspace(projectId, branchName.replace(/-+$/, '').trim() || undefined)
      onClose()
    } catch (err: unknown) {
      console.error('Failed to create worktree', getErrorMessage(err))
      setCreating(false)
    }
  }, [creating, projectId, branchName, createWorktreeWorkspace, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div ref={dialogRef} className="w-80 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--t-border)]">
          <h3 className="text-[12px] font-semibold text-zinc-200">New Worktree</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        <div className="px-4 py-3">
          <label className="text-[10px] text-zinc-500 mb-1 block">Branch name</label>
          <input
            ref={inputRef}
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(sanitize(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="e.g. add-auth"
            className="w-full px-2 py-1.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--t-accent)]/50"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--t-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] disabled:opacity-40 text-white rounded transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
