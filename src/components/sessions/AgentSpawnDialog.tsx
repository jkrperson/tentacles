import { useState, useCallback, useRef, useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getErrorMessage } from '../../utils/errors'
import { AgentIcon } from '../icons/AgentIcons'
import type { AgentType, Workspace } from '../../types'

interface AgentSpawnDialogProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  preselectedWorkspaceId?: string
}

export function AgentSpawnDialog({ projectId, isOpen, onClose, preselectedWorkspaceId }: AgentSpawnDialogProps) {
  const defaultAgent = useSettingsStore((s) => s.settings.defaultAgent)
  const agents = useSettingsStore((s) => s.settings.agents)
  const enabledAgents = agents.filter((a) => a.enabled)
  const createSessionInWorkspace = useSessionStore((s) => s.createSessionInWorkspace)
  const createWorktreeWorkspace = useWorkspaceStore((s) => s.createWorktreeWorkspace)
  const getProjectWorkspaces = useWorkspaceStore((s) => s.getProjectWorkspaces)
  const persistSessions = useSessionStore((s) => s.persistSessions)

  const workspaces = getProjectWorkspaces(projectId)

  const [agentType, setAgentType] = useState<AgentType>(defaultAgent)
  const [agentName, setAgentName] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(preselectedWorkspaceId || workspaces[0]?.id || '')
  const [newWorktree, setNewWorktree] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sanitizeBranch = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAgentType(defaultAgent)
      setAgentName('')
      setSelectedWorkspaceId(preselectedWorkspaceId || workspaces[0]?.id || '')
      setNewWorktree(false)
      setWorktreeName('')
      setCreating(false)
      setError(null)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [isOpen, defaultAgent, preselectedWorkspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      let wsId = selectedWorkspaceId
      if (newWorktree) {
        const ws = await createWorktreeWorkspace(projectId, worktreeName.trim() || undefined)
        wsId = ws.id
      }
      await createSessionInWorkspace(wsId, agentName.trim() || undefined, agentType)
      persistSessions()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setCreating(false)
    }
  }, [creating, selectedWorkspaceId, newWorktree, projectId, worktreeName, agentName, agentType, createSessionInWorkspace, createWorktreeWorkspace, persistSessions, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div ref={dialogRef} className="w-80 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--t-border)]">
          <h3 className="text-[12px] font-semibold text-zinc-200">New Agent</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Agent type */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Agent type</label>
            <div className="flex gap-1.5 flex-wrap">
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setAgentType(agent.id)}
                  title={agent.name}
                  className={`flex items-center justify-center p-2 rounded border transition-colors ${
                    agentType === agent.id
                      ? 'border-[var(--t-accent)]/50 bg-[var(--t-accent)]/10 text-zinc-200'
                      : 'border-[var(--t-border)] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  <AgentIcon icon={agent.icon} size={22} />
                </button>
              ))}
            </div>
          </div>

          {/* Agent name */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Name (optional)</label>
            <input
              ref={nameInputRef}
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. fix-auth-bug"
              className="w-full px-2 py-1.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--t-accent)]/50"
            />
          </div>

          {/* Workspace picker */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Workspace</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {workspaces.map((ws) => (
                <WorkspaceOption
                  key={ws.id}
                  workspace={ws}
                  selected={!newWorktree && selectedWorkspaceId === ws.id}
                  onClick={() => { setSelectedWorkspaceId(ws.id); setNewWorktree(false) }}
                />
              ))}
              {/* New worktree option */}
              <button
                onClick={() => setNewWorktree(true)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors ${
                  newWorktree
                    ? 'bg-[var(--t-accent)]/10 border border-[var(--t-accent)]/50 text-zinc-200'
                    : 'border border-[var(--t-border)] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                  <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
                </svg>
                New worktree...
              </button>
            </div>
            {newWorktree && (
              <input
                type="text"
                value={worktreeName}
                onChange={(e) => setWorktreeName(sanitizeBranch(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Branch name, e.g. add-auth"
                autoFocus
                className="mt-1.5 w-full px-2 py-1.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--t-accent)]/50"
              />
            )}
          </div>
        </div>

        {error && (
          <p className="px-4 pb-2 text-[10px] text-red-400 leading-tight">{error}</p>
        )}

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

function WorkspaceOption({ workspace, selected, onClick }: { workspace: Workspace; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors ${
        selected
          ? 'bg-[var(--t-accent)]/10 border border-[var(--t-accent)]/50 text-zinc-200'
          : 'border border-[var(--t-border)] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
      }`}
    >
      {workspace.type === 'main' ? (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
          <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM13 5H9.5a.5.5 0 0 1-.5-.5V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/>
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
        </svg>
      )}
      <span className="truncate">{workspace.type === 'main' ? 'Main workspace' : workspace.name}</span>
      {workspace.branch && workspace.type !== 'main' && (
        <span className="text-[9px] text-zinc-600 truncate ml-auto">{workspace.branch}</span>
      )}
    </button>
  )
}
