import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import type { AgentType } from '../../types'

const AGENT_BADGE_COLOR: Record<AgentType, string> = {
  claude: 'bg-orange-500/20 text-orange-300',
  codex: 'bg-green-500/20 text-green-300',
  opencode: 'bg-blue-500/20 text-blue-300',
}

const AGENT_LETTER: Record<AgentType, string> = {
  claude: 'C',
  codex: 'X',
  opencode: 'O',
}

const STATUS_DOTS: Record<string, string> = {
  running: 'bg-emerald-400',
  idle: 'bg-amber-400',
  completed: 'bg-zinc-500',
  errored: 'bg-red-400',
}

export function TerminalTabs() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const setActive = useSessionStore((s) => s.setActiveSession)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)

  const projectSessions = useMemo(
    () => activeProjectId
      ? sessionOrder.filter((id) => sessions.get(id)?.cwd === activeProjectId)
      : sessionOrder,
    [sessionOrder, sessions, activeProjectId],
  )

  if (projectSessions.length === 0) return null

  return (
    <div className="flex items-center h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] overflow-x-auto">
      {projectSessions.map((id) => {
        const session = sessions.get(id)
        if (!session) return null
        const isActive = id === activeSessionId
        return (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`relative flex items-center gap-2 px-4 h-full text-[12px] border-r border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
              isActive
                ? 'bg-[var(--t-bg-base)] text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[session.status] ?? 'bg-zinc-500'}`} />
            {session.agentType !== 'claude' && (
              <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold flex-shrink-0 ${AGENT_BADGE_COLOR[session.agentType] ?? ''}`}>
                {AGENT_LETTER[session.agentType] ?? '?'}
              </span>
            )}
            <span className="truncate max-w-36">{session.name}</span>
            {session.hasUnread && !isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
            )}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500" />}
          </button>
        )
      })}
    </div>
  )
}
