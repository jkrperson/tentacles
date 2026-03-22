import type { AppSettings } from '../../../types'
import { trpc } from '../../../trpc'
import { useCallback } from 'react'
import { AgentIcon } from '../../icons/AgentIcons'

interface GeneralSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function GeneralSection({ draft, onUpdate }: GeneralSectionProps) {
  const enabledAgents = draft.agents.filter((a) => a.enabled)

  const handleBrowse = useCallback(async () => {
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) onUpdate((d) => ({ ...d, defaultProjectPath: dir }))
  }, [onUpdate])

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Default Agent</label>
        <div className="grid grid-cols-3 gap-1.5">
          {enabledAgents.map((agent) => {
            const selected = draft.defaultAgent === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => onUpdate((d) => ({ ...d, defaultAgent: agent.id }))}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] border transition-colors ${
                  selected
                    ? 'border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-zinc-200'
                    : 'border-[var(--t-border-input)] text-zinc-400 hover:border-[var(--t-border-input-hover)] hover:text-zinc-300'
                }`}
              >
                <AgentIcon icon={agent.icon} size={14} />
                {agent.name}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Max Agents</label>
        <input type="number" min={1} max={50} value={draft.maxSessions}
          onChange={(e) => onUpdate((d) => ({ ...d, maxSessions: parseInt(e.target.value) || 10 }))}
          className="w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors" />
      </div>

      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Default Project Path</label>
        <div className="flex gap-2">
          <input type="text" value={draft.defaultProjectPath}
            onChange={(e) => onUpdate((d) => ({ ...d, defaultProjectPath: e.target.value }))}
            className="flex-1 w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors"
            placeholder="/path/to/projects" />
          <button onClick={handleBrowse}
            className="px-3 py-2 bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md text-[12px] text-zinc-400 hover:text-zinc-200 hover:border-[var(--t-border-input-hover)] transition-colors">
            Browse
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <span className="text-[13px] text-zinc-300">Media Panel</span>
        <button
          onClick={() => onUpdate((d) => ({ ...d, enableMediaPanel: !d.enableMediaPanel }))}
          className={`w-9 h-5 rounded-full transition-colors relative ${
            draft.enableMediaPanel ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'
          }`}
        >
          <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${draft.enableMediaPanel ? 'left-[18px]' : 'left-[3px]'}`} />
        </button>
      </div>
    </div>
  )
}
