import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useUIStore } from '../../stores/uiStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectConfigStore } from '../../stores/projectConfigStore'
import { trpc } from '../../trpc'
import type { Session, ShellTerminal } from '../../types'

const STATUS_CONFIG: Record<string, { label: string; cssVar: string }> = {
  running:     { label: 'Working',      cssVar: 'var(--t-status-running)' },
  needs_input: { label: 'Needs input',  cssVar: 'var(--t-status-needs-input)' },
  completed:   { label: 'Completed',    cssVar: 'var(--t-status-completed)' },
  idle:        { label: 'Idle',         cssVar: 'var(--t-status-idle)' },
  errored:     { label: 'Errored',      cssVar: 'var(--t-status-errored)' },
}

function StatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const isAnimated = status === 'running' || status === 'needs_input'
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      {isAnimated && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          style={{ backgroundColor: config.cssVar }}
        />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: config.cssVar }}
      />
    </span>
  )
}

function AgentCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle
  const agents = useSettingsStore((s) => s.settings.agents)
  const agentConfig = agents.find((a) => a.id === session.agentType)

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--t-bg-surface)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] transition-colors text-left w-full"
    >
      <StatusDot status={session.status} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-zinc-200 truncate">{session.name}</div>
        <div className="text-[10px] text-zinc-500 truncate">
          {agentConfig?.name ?? session.agentType} · {config.label}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 flex-shrink-0">
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  )
}

function TerminalCard({ terminal, onOpen }: { terminal: ShellTerminal; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--t-bg-surface)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] transition-colors text-left w-full"
    >
      <StatusDot status={terminal.status === 'running' ? 'running' : 'completed'} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-zinc-200 truncate">{terminal.name}</div>
        <div className="text-[10px] text-zinc-500 truncate">
          {terminal.status === 'running' ? 'Running' : 'Exited'}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 flex-shrink-0">
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  )
}

interface WorkspacePageProps {
  workspaceId: string
}

export function WorkspacePage({ workspaceId }: WorkspacePageProps) {
  const workspace = useWorkspaceStore((s) => s.workspaces.get(workspaceId))
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const terminals = useTerminalStore((s) => s.terminals)
  const terminalOrder = useTerminalStore((s) => s.terminalOrder)
  const openTerminalView = useUIStore((s) => s.openTerminalView)
  const openSpawnDialog = useUIStore((s) => s.openSpawnDialog)
  const setupLog = useProjectConfigStore((s) => s.setupLogs.get(workspaceId))
  const isSetupRunning = useProjectConfigStore((s) => s.runningSetups.has(workspaceId))
  const loadSetupLog = useProjectConfigStore((s) => s.loadSetupLog)

  // Workspace sessions and terminals
  const workspaceSessions = useMemo(() => {
    return sessionOrder
      .map((id) => sessions.get(id))
      .filter((s): s is Session => s != null && s.workspaceId === workspaceId)
  }, [sessionOrder, sessions, workspaceId])

  const workspaceTerminals = useMemo(() => {
    return terminalOrder
      .map((id) => terminals.get(id))
      .filter((t): t is ShellTerminal => t != null && t.workspaceId === workspaceId)
  }, [terminalOrder, terminals, workspaceId])

  // Git diff stats (same polling as WorkspaceItem)
  const dirPath = workspace?.worktreePath ?? workspace?.projectId ?? ''
  const [diffStats, setDiffStats] = useState<{ insertions: number; deletions: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchDiffStats = useCallback(() => {
    if (!dirPath) return
    trpc.git.diffStats.query({ dirPath }).then(setDiffStats).catch(() => {})
  }, [dirPath])

  useEffect(() => {
    fetchDiffStats()
    intervalRef.current = setInterval(fetchDiffStats, 10000)
    return () => clearInterval(intervalRef.current)
  }, [fetchDiffStats])

  // Load setup log on mount
  useEffect(() => {
    loadSetupLog(workspaceId)
  }, [workspaceId, loadSetupLog])

  const handleOpenSession = (sessionId: string) => {
    setActiveSession(sessionId)
    openTerminalView()
  }

  const handleSpawnAgent = () => {
    if (workspace) {
      openSpawnDialog(workspace.projectId, workspaceId)
    }
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Workspace not found
      </div>
    )
  }

  const isMain = workspace.type === 'main'
  const hasContent = workspaceSessions.length > 0 || workspaceTerminals.length > 0

  return (
    <div className="h-full overflow-y-auto bg-[var(--t-bg-base)]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            {/* Branch icon */}
            {isMain ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-500">
                <circle cx="8" cy="8" r="3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-500">
                <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
              </svg>
            )}
            <h1 className="text-lg font-semibold text-zinc-100">
              {workspace.name}
            </h1>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              workspace.status === 'active'
                ? 'bg-green-500/10 text-green-400'
                : workspace.status === 'merged'
                  ? 'bg-[var(--t-accent)]/10 text-[var(--t-accent)]'
                  : 'bg-zinc-500/10 text-zinc-500'
            }`}>
              {workspace.status}
            </span>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            {workspace.branch && (
              <span className="font-mono">{workspace.branch}</span>
            )}
            {diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0) && (
              <span className="flex items-center gap-1.5 font-mono">
                {diffStats.insertions > 0 && (
                  <span className="text-green-500">+{diffStats.insertions}</span>
                )}
                {diffStats.deletions > 0 && (
                  <span className="text-red-500">-{diffStats.deletions}</span>
                )}
              </span>
            )}
            {workspace.worktreePath && (
              <span className="truncate max-w-xs" title={workspace.worktreePath}>
                {workspace.worktreePath}
              </span>
            )}
          </div>
        </div>

        {/* Agents section */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
              Agents
              {workspaceSessions.length > 0 && (
                <span className="ml-1.5 text-zinc-600">{workspaceSessions.length}</span>
              )}
            </h2>
            <button
              onClick={handleSpawnAgent}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
              </svg>
              New agent
            </button>
          </div>

          {workspaceSessions.length === 0 ? (
            <div className="text-[12px] text-zinc-600 py-4 text-center border border-dashed border-[var(--t-border)] rounded-lg">
              No agents in this workspace
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {workspaceSessions.map((session) => (
                <AgentCard
                  key={session.id}
                  session={session}
                  onOpen={() => handleOpenSession(session.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Terminals section */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
              Terminals
              {workspaceTerminals.length > 0 && (
                <span className="ml-1.5 text-zinc-600">{workspaceTerminals.length}</span>
              )}
            </h2>
          </div>

          {workspaceTerminals.length === 0 ? (
            <div className="text-[12px] text-zinc-600 py-4 text-center border border-dashed border-[var(--t-border)] rounded-lg">
              No terminals in this workspace
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {workspaceTerminals.map((terminal) => (
                <TerminalCard
                  key={terminal.id}
                  terminal={terminal}
                  onOpen={() => openTerminalView()}
                />
              ))}
            </div>
          )}
        </section>

        {/* Setup Log section — only for worktree workspaces with a log */}
        {!isMain && (setupLog || isSetupRunning) && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
                Setup
                {isSetupRunning && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-yellow-400 normal-case tracking-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    Running
                  </span>
                )}
                {!isSetupRunning && setupLog?.completedAt && (
                  <span className={`ml-2 text-[10px] font-normal normal-case tracking-normal ${
                    setupLog.scripts.every((s) => s.exitCode === 0) ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {setupLog.scripts.every((s) => s.exitCode === 0) ? 'Completed' : 'Failed'}
                  </span>
                )}
              </h2>
            </div>

            <div className="rounded-lg bg-zinc-950 border border-[var(--t-border)] max-h-60 overflow-y-auto p-3 font-mono text-[11px]">
              {setupLog?.scripts.map((script, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <div className="text-zinc-400">
                    <span className="text-zinc-500">$ </span>
                    {script.command}
                  </div>
                  {script.output && (
                    <pre className="text-zinc-500 whitespace-pre-wrap break-all mt-0.5">{script.output}</pre>
                  )}
                  {script.exitCode !== null && script.exitCode !== 0 && (
                    <div className="text-red-400 mt-0.5">exit code {script.exitCode}</div>
                  )}
                </div>
              ))}
              {isSetupRunning && (!setupLog || setupLog.scripts.length === 0) && (
                <div className="text-zinc-600">Starting setup scripts...</div>
              )}
            </div>
          </section>
        )}

        {/* Integrations section — placeholder for future GitHub/Linear features */}
        <section className="mb-6">
          <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Integrations
          </h2>
          <div className="flex flex-col gap-2">
            {/* GitHub PR */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-[var(--t-border)] text-zinc-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
              </svg>
              <span className="text-[12px]">
                {workspace.linkedPR ?? 'Link a pull request'}
              </span>
            </div>

            {/* Linear issue */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-[var(--t-border)] text-zinc-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.22.53l2.25 2.25a.75.75 0 101.06-1.06L8.5 7.94V4.75z"/>
              </svg>
              <span className="text-[12px]">
                {workspace.linkedIssue ?? 'Link a Linear issue'}
              </span>
            </div>
          </div>
        </section>

        {/* Empty state — only if nothing at all */}
        {!hasContent && (
          <div className="text-center py-8">
            <div className="text-zinc-600 text-[13px] mb-4">
              This workspace is empty. Spawn an agent to get started.
            </div>
            <button
              onClick={handleSpawnAgent}
              className="px-4 py-2 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white text-[13px] font-medium rounded-lg transition-colors"
            >
              Spawn Agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
