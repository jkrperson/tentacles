import { useState, useCallback, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getErrorMessage } from '../../utils/errors'
import { AgentIcon } from '../icons/AgentIcons'
import type { AgentType } from '../../types'

interface WorktreeCreateDialogProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

export function WorktreeCreateDialog({ projectId, isOpen, onClose }: WorktreeCreateDialogProps) {
  const createWorktreeWorkspace = useWorkspaceStore((s) => s.createWorktreeWorkspace)
  const createSessionInWorkspace = useSessionStore((s) => s.createSessionInWorkspace)
  const persistSessions = useSessionStore((s) => s.persistSessions)
  const defaultAgent = useSettingsStore((s) => s.settings.defaultAgent)
  const agents = useSettingsStore((s) => s.settings.agents)
  const enabledAgents = agents.filter((a) => a.enabled)

  const [branchName, setBranchName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(defaultAgent)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sanitize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBranchName('')
      setSelectedAgent(defaultAgent)
      setCreating(false)
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, defaultAgent])

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
    setError(null)
    try {
      const ws = await createWorktreeWorkspace(projectId, branchName.replace(/-+$/, '').trim() || undefined)
      if (selectedAgent) {
        await createSessionInWorkspace(ws.id, undefined, selectedAgent)
        persistSessions()
      }
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setCreating(false)
    }
  }, [creating, projectId, branchName, selectedAgent, createWorktreeWorkspace, createSessionInWorkspace, persistSessions, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div ref={dialogRef} className="w-80 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] shadow-2xl">
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
            className="w-full px-2 py-1.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--t-accent)]/50"
          />
          {error && (
            <p className="mt-2 text-[10px] text-red-400 leading-tight">{error}</p>
          )}
        </div>

        {/* Spawn agent selector */}
        <div className="px-4 pb-3">
          <label className="text-[10px] text-zinc-500 mb-1 block">Spawn agent</label>
          <div className="flex">
            {enabledAgents.map((agent, i) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                title={agent.name}
                className={`flex-1 flex items-center justify-center py-2 border transition-colors ${
                  i > 0 ? '-ml-px' : ''
                } ${
                  selectedAgent === agent.id
                    ? 'border-[var(--t-accent)]/50 bg-[var(--t-accent)]/10 text-zinc-200 z-10'
                    : 'border-[var(--t-border)] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <AgentIcon icon={agent.icon} size={22} />
              </button>
            ))}
          </div>
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
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] disabled:opacity-40 text-white transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
