import { useMemo } from 'react'
import { TerminalTabs } from './TerminalTabs'
import { TerminalPanel } from './TerminalPanel'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'

interface TerminalViewProps {
  onNewSession: () => void
}

export function TerminalView({ onNewSession }: TerminalViewProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const sessions = useSessionStore((s) => s.sessions)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)

  const projectSessions = useMemo(
    () => activeProjectId
      ? sessionOrder.filter((id) => sessions.get(id)?.cwd === activeProjectId)
      : sessionOrder,
    [sessionOrder, sessions, activeProjectId],
  )

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      <TerminalTabs />
      <div className="flex-1 min-h-0 relative">
        {projectSessions.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-zinc-600 text-[15px] mb-3">
                {activeProjectId ? 'No agents in this project' : 'No active agents'}
              </div>
              <button
                onClick={onNewSession}
                className="px-4 py-2 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                Spawn Agent
              </button>
              <div className="text-zinc-700 text-[11px] mt-3">
                or press <kbd className="px-1.5 py-0.5 bg-[var(--t-border)] rounded text-zinc-500 text-[10px]">Cmd+T</kbd>
              </div>
            </div>
          </div>
        )}
        {/* ALL terminal panels stay mounted across all projects — only visibility changes */}
        {sessionOrder.map((id) => (
          <TerminalPanel key={id} sessionId={id} isActive={id === activeSessionId} />
        ))}
      </div>
    </div>
  )
}
