import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ShellTerminalPanel } from './ShellTerminalPanel'
import { useTerminalStore } from '../../stores/terminalStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { trpc } from '../../trpc'

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
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const getProjectWorkspaces = useWorkspaceStore((s) => s.getProjectWorkspaces)

  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const projectWorkspaces = activeProjectId ? getProjectWorkspaces(activeProjectId) : []
  const hasWorktrees = projectWorkspaces.some((ws) => ws.type === 'worktree')

  // Position dropdown above the chevron button using its bounding rect
  useEffect(() => {
    if (!wsDropdownOpen || !chevronRef.current) return
    const rect = chevronRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.top, left: rect.left })
  }, [wsDropdownOpen])

  // Close dropdown on outside click
  useEffect(() => {
    if (!wsDropdownOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        chevronRef.current && !chevronRef.current.contains(target)
      ) {
        setWsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [wsDropdownOpen])

  // Close dropdown on Escape
  useEffect(() => {
    if (!wsDropdownOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWsDropdownOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [wsDropdownOpen])

  const handleCreateInWorkspace = useCallback((workspaceId: string) => {
    setWsDropdownOpen(false)
    useTerminalStore.getState().createTerminal(workspaceId)
  }, [])

  const projectTerminals = useMemo(
    () => activeProjectId
      ? terminalOrder.filter((id) => {
          const t = terminals.get(id)
          if (!t) return false
          const ws = workspaces.get(t.workspaceId)
          return ws?.projectId === activeProjectId
        })
      : terminalOrder,
    [terminalOrder, terminals, activeProjectId, workspaces],
  )

  const newTerminalButtons = (
    <>
      <button
        onClick={onNewTerminal}
        className="flex items-center justify-center w-7 h-full text-zinc-600 hover:text-zinc-300 hover:bg-[var(--t-bg-hover)] transition-colors flex-shrink-0"
        title="New terminal (Cmd+`)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
      </button>
      {hasWorktrees && (
        <button
          ref={chevronRef}
          onClick={() => setWsDropdownOpen((v) => !v)}
          className={`flex items-center justify-center w-4 h-full text-zinc-600 hover:text-zinc-300 hover:bg-[var(--t-bg-hover)] transition-colors flex-shrink-0 ${wsDropdownOpen ? 'text-zinc-300' : ''}`}
          title="New terminal in worktree..."
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.2 5.74a.75.75 0 0 1 1.06-.04L8 9.23l3.74-3.53a.75.75 0 1 1 1.02 1.1l-4.25 4a.75.75 0 0 1-1.02 0l-4.25-4a.75.75 0 0 1-.04-1.06z"/>
          </svg>
        </button>
      )}
    </>
  )

  const dropdownPortal = wsDropdownOpen && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      className="fixed w-52 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-md shadow-xl z-[9999] py-1"
      style={{ top: dropdownPos.top, left: dropdownPos.left, transform: 'translate(-100%, -100%) translateX(16px)' }}
    >
      <div className="px-2 py-1 text-[9px] text-zinc-600 uppercase tracking-wider">Open terminal in...</div>
      {projectWorkspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => handleCreateInWorkspace(ws.id)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-[var(--t-bg-hover)] transition-colors text-left"
        >
          {ws.type === 'main' ? (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM13 5H9.5a.5.5 0 0 1-.5-.5V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
              <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
            </svg>
          )}
          <span className="truncate">{ws.type === 'main' ? 'Main workspace' : ws.name}</span>
          {ws.branch && ws.type !== 'main' && (
            <span className="text-[9px] text-zinc-600 truncate ml-auto">{ws.branch}</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
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

        {/* Tabs + new terminal buttons (always visible, left-aligned) */}
        <div className="flex items-center h-full overflow-x-auto flex-1 min-w-0">
          {projectTerminals.map((id) => {
            const terminal = terminals.get(id)
            if (!terminal) return null
            const isActive = id === activeTerminalId
            const ws = workspaces.get(terminal.workspaceId)
            const wsLabel = ws ? ws.name : null
            return (
              <button
                key={id}
                onClick={() => {
                  setActiveTerminal(id)
                  if (!expanded) onToggleExpanded()
                }}
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
                {wsLabel && (
                  <span className="text-[9px] text-zinc-600 truncate max-w-16">[{wsLabel}]</span>
                )}
                {terminal.status === 'exited' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                )}
                {/* Close button */}
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    if (terminal.status === 'running') trpc.terminal.kill.mutate({ id })
                    removeTerminal(id)
                  }}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </span>
                {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--t-accent)]" />}
              </button>
            )
          })}
          {/* + and dropdown right after the last tab */}
          {newTerminalButtons}
        </div>
      </div>

      {/* Dropdown portal — rendered outside overflow-hidden ancestors */}
      {dropdownPortal}

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
