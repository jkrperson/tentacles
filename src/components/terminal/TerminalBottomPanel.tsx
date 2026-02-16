import { useMemo } from 'react'
import { ShellTerminalPanel } from './ShellTerminalPanel'
import { useTerminalStore } from '../../stores/terminalStore'
import { useProjectStore } from '../../stores/projectStore'

interface TerminalBottomPanelProps {
  onNewTerminal: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

export function TerminalBottomPanel({ onNewTerminal, expanded, onToggleExpanded }: TerminalBottomPanelProps) {
  const terminals = useTerminalStore((s) => s.terminals)
  const terminalOrder = useTerminalStore((s) => s.terminalOrder)
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)
  const removeTerminal = useTerminalStore((s) => s.removeTerminal)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)

  const projectTerminals = useMemo(
    () => activeProjectId
      ? terminalOrder.filter((id) => terminals.get(id)?.cwd === activeProjectId)
      : terminalOrder,
    [terminalOrder, terminals, activeProjectId],
  )

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      {/* Header / tab bar — always visible */}
      <div className="flex items-center h-8 bg-[var(--t-bg-surface)] border-t border-[var(--t-border)] flex-shrink-0">
        {/* Toggle + label */}
        <button
          onClick={onToggleExpanded}
          className="flex items-center gap-1.5 px-3 h-full text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          title={expanded ? 'Collapse terminal panel' : 'Expand terminal panel'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${expanded ? '' : '-rotate-90'}`}>
            <path d="M3.2 5.74a.75.75 0 0 1 1.06-.04L8 9.23l3.74-3.53a.75.75 0 1 1 1.02 1.1l-4.25 4a.75.75 0 0 1-1.02 0l-4.25-4a.75.75 0 0 1-.04-1.06z"/>
          </svg>
          TERMINAL
        </button>

        {/* Tabs (only when expanded and terminals exist) */}
        {expanded && (
          <div className="flex items-center h-full overflow-x-auto flex-1 min-w-0">
            {projectTerminals.map((id) => {
              const terminal = terminals.get(id)
              if (!terminal) return null
              const isActive = id === activeTerminalId
              return (
                <button
                  key={id}
                  onClick={() => setActiveTerminal(id)}
                  className={`group relative flex items-center gap-1.5 px-3 h-full text-[11px] border-l border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
                    isActive
                      ? 'bg-[var(--t-bg-base)] text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 opacity-60">
                    <path d="M4 12l4-4-4-4" />
                  </svg>
                  <span className="truncate max-w-28">{terminal.name}</span>
                  {terminal.status === 'exited' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                  )}
                  {/* Close button */}
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      if (terminal.status === 'running') window.electronAPI.terminal.kill(id)
                      removeTerminal(id)
                    }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                  </span>
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500" />}
                </button>
              )
            })}
          </div>
        )}

        {!expanded && <div className="flex-1" />}

        {/* New terminal button */}
        <button
          onClick={onNewTerminal}
          className="flex-shrink-0 flex items-center justify-center w-8 h-full text-zinc-600 hover:text-zinc-300 hover:bg-[var(--t-bg-hover)] transition-colors"
          title="New terminal (Cmd+`)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
        </button>
      </div>

      {/* Terminal area — always mounted, hidden when collapsed */}
      <div
        className="flex-1 min-h-0 relative"
        style={{ display: expanded ? undefined : 'none' }}
      >
        {projectTerminals.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <button
              onClick={onNewTerminal}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-400 text-[12px] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 12l4-4-4-4" />
              </svg>
              New Terminal
            </button>
          </div>
        )}
        {/* All shell terminal panels stay mounted — only visibility changes */}
        {terminalOrder.map((id) => (
          <ShellTerminalPanel
            key={id}
            terminalId={id}
            isActive={id === activeTerminalId}
          />
        ))}
      </div>
    </div>
  )
}
