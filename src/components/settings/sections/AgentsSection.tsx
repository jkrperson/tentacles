import { useState } from 'react'
import type { AppSettings, AgentConfig, AgentIconKey } from '../../../types'
import { AgentIcon } from '../../icons/AgentIcons'

const ICON_OPTIONS: AgentIconKey[] = ['claude', 'codex', 'gemini', 'cursor', 'generic']

interface AgentsSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function AgentsSection({ draft, onUpdate }: AgentsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const updateAgent = (id: string, updates: Partial<AgentConfig>) => {
    onUpdate((d) => ({
      ...d,
      agents: d.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }))
  }

  const removeAgent = (id: string) => {
    onUpdate((d) => ({
      ...d,
      agents: d.agents.filter((a) => a.id !== id),
      defaultAgent: d.defaultAgent === id ? (d.agents.find((a) => a.id !== id)?.id ?? 'claude') : d.defaultAgent,
    }))
    if (editingId === id) setEditingId(null)
  }

  const addAgent = () => {
    const id = `custom-${Date.now()}`
    const newAgent: AgentConfig = {
      id,
      name: 'New Agent',
      command: '',
      icon: 'generic',
      enabled: true,
      pinned: false,
    }
    onUpdate((d) => ({ ...d, agents: [...d.agents, newAgent] }))
    setEditingId(id)
  }

  const inputClass = 'w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-2.5 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors'

  return (
    <div className="space-y-4">
      {draft.agents.map((agent) => {
        const isEditing = editingId === agent.id
        return (
          <div key={agent.id} className="border border-[var(--t-border)] rounded-lg overflow-hidden">
            {/* Agent row */}
            <div className="flex items-center gap-3 px-4 py-2.5">
              <AgentIcon icon={agent.icon} size={18} className={agent.enabled ? 'text-zinc-300' : 'text-zinc-600'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-medium ${agent.enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    {agent.name}
                  </span>
                  {agent.installed === false && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-medium">
                      NOT FOUND
                    </span>
                  )}
                  {agent.installed === true && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">
                      INSTALLED
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-600 truncate font-mono">{agent.command || '(no command)'}</div>
              </div>
              {/* Pinned toggle */}
              <button
                onClick={() => updateAgent(agent.id, { pinned: !agent.pinned })}
                className={`p-1 rounded transition-colors ${agent.pinned ? 'text-[var(--t-accent)]' : 'text-zinc-600 hover:text-zinc-400'}`}
                title={agent.pinned ? 'Pinned to sidebar' : 'Not pinned'}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  {agent.pinned ? (
                    <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5H8.5v5.543a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z" />
                  ) : (
                    <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5H8.5v5.543a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354zm1.58 1.408l-.002-.001.002.001zm-.002-.001A1.13 1.13 0 0 1 5.287 1h5.426a1.13 1.13 0 0 1-.437.553L10 1.735V6.85a.5.5 0 0 1-.238.425l-.33.206a4.947 4.947 0 0 0-.866.673 3.26 3.26 0 0 0-.37.424H3.803c.123-.148.264-.3.42-.452A4.94 4.94 0 0 1 5.33 7.28l.33-.206A.5.5 0 0 0 5.9 6.65V1.735l-.177-.182z" />
                  )}
                </svg>
              </button>
              {/* Enabled toggle */}
              <button
                onClick={() => updateAgent(agent.id, { enabled: !agent.enabled })}
                className={`w-8 h-4.5 rounded-full transition-colors relative ${
                  agent.enabled ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'
                }`}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-[3px] transition-all ${agent.enabled ? 'left-[17px]' : 'left-[3px]'}`} />
              </button>
              {/* Edit button */}
              <button
                onClick={() => setEditingId(isEditing ? null : agent.id)}
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Edit"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
                </svg>
              </button>
            </div>
            {/* Expanded edit form */}
            {isEditing && (
              <div className="px-4 py-3 border-t border-[var(--t-border)] bg-[var(--t-bg-base)]/50 space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Name</label>
                  <input
                    type="text"
                    value={agent.name}
                    onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Command</label>
                  <input
                    type="text"
                    value={agent.command}
                    onChange={(e) => updateAgent(agent.id, { command: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. claude --dangerously-skip-permissions"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Icon</label>
                  <div className="flex gap-2">
                    {ICON_OPTIONS.map((key) => (
                      <button
                        key={key}
                        onClick={() => updateAgent(agent.id, { icon: key })}
                        className={`p-2 rounded border transition-colors ${
                          agent.icon === key
                            ? 'border-[var(--t-accent)]/50 bg-[var(--t-accent)]/10 text-zinc-200'
                            : 'border-[var(--t-border)] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                        }`}
                        title={key}
                      >
                        <AgentIcon icon={key} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => removeAgent(agent.id)}
                    className="text-[11px] text-red-500/70 hover:text-red-400 transition-colors"
                  >
                    Remove Agent
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={addAgent}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] text-zinc-500 hover:text-zinc-300 border border-dashed border-[var(--t-border)] rounded-lg hover:border-zinc-600 transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
        Add Agent
      </button>
    </div>
  )
}
