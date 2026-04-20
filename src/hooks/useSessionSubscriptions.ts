import { useEffect, useRef } from 'react'
import { trpc } from '../trpc'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useProjectStore } from '../stores/projectStore'
import { useUIStore } from '../stores/uiStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

export function useSessionSubscriptions() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const updateStatus = useSessionStore((s) => s.updateStatus)
  const setHasUnread = useSessionStore((s) => s.setHasUnread)
  const acknowledgeSession = useSessionStore((s) => s.acknowledgeSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const setStatusDetail = useSessionStore((s) => s.setStatusDetail)
  const updateTerminalStatus = useTerminalStore((s) => s.updateTerminalStatus)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeSessionRef = useRef(activeSessionId)
  activeSessionRef.current = activeSessionId

  // Acknowledge active session on switch
  useEffect(() => {
    if (activeSessionId) acknowledgeSession(activeSessionId)
  }, [activeSessionId, acknowledgeSession])

  // Listen for OSC title changes — extract clean session names
  useEffect(() => {
    const sub = trpc.session.onTitle.subscribe(undefined, {
      onData: ({ id, title }) => {
        const session = useSessionStore.getState().sessions.get(id)
        if (!session || session.status === 'completed' || session.status === 'errored') return
        if (session.agentType !== 'claude') return

        const cleanTitle = title.replace(/^[\u2800-\u28FF\u2733]\s*/, '')
        const isGenericName = cleanTitle === 'Claude Code' || cleanTitle === 'Codex CLI' || cleanTitle === 'opencode'
        if (cleanTitle && !isGenericName && cleanTitle !== session.name) {
          renameSession(id, cleanTitle)
        }
      },
    })
    return () => sub.unsubscribe()
  }, [renameSession])

  // Listen for session exits
  useEffect(() => {
    const sub = trpc.session.onExit.subscribe(undefined, {
      onData: ({ id, exitCode }) => {
        const status = exitCode === 0 ? 'completed' : 'errored'
        updateStatus(id, status, exitCode)
        if (id !== activeSessionRef.current) setHasUnread(id, true)
      },
    })
    return () => sub.unsubscribe()
  }, [updateStatus, setHasUnread])

  // Listen for detailed status updates from hook events
  useEffect(() => {
    const sub = trpc.session.onStatusDetail.subscribe(undefined, {
      onData: ({ id, detail }) => {
        setStatusDetail(id, detail)

        // Fallback for agents (especially Codex) when a status event is missing:
        // infer a coarse status from the detail text so UI state doesn't get stuck.
        const session = useSessionStore.getState().sessions.get(id)
        if (!session || session.exitCode != null || session.status === 'errored' || !detail) return
        const normalized = detail.toLowerCase()
        if (normalized.includes('needs permission') || normalized.includes('needs input')) {
          if (session.status !== 'needs_input') updateStatus(id, 'needs_input')
          return
        }
        if (
          normalized.includes('working') ||
          normalized.includes('running') ||
          normalized.includes('editing') ||
          normalized.includes('reading') ||
          normalized.includes('writing') ||
          normalized.includes('searching')
        ) {
          if (session.status !== 'running') updateStatus(id, 'running')
        }
      },
    })
    return () => sub.unsubscribe()
  }, [setStatusDetail, updateStatus])

  // Listen for agent status changes from hook events
  useEffect(() => {
    // Track sessions that have reported 'running' at least once from the hook,
    // so we can distinguish a real "finished" idle from the initial idle on spawn.
    const hasBeenActive = new Set(
      Array.from(useSessionStore.getState().sessions.values())
        .filter((s) => s.status === 'running' || s.status === 'needs_input' || s.status === 'completed')
        .map((s) => s.id),
    )

    const sub = trpc.session.onAgentStatus.subscribe(undefined, {
      onData: ({ id, status: rawStatus }) => {
        const session = useSessionStore.getState().sessions.get(id)
        if (!session || session.status === 'errored') return
        if (session.exitCode != null) return

        if (rawStatus === 'running') hasBeenActive.add(id)

        // Don't let a stale 'idle' overwrite 'needs_input' —
        // needs_input should only be cleared by 'running' or an exit.
        if (rawStatus === 'idle' && session.status === 'needs_input') return

        let finalStatus = rawStatus
        // Only mark as completed if this session has actually worked before
        if (rawStatus === 'idle' && id !== activeSessionRef.current && hasBeenActive.has(id)) {
          finalStatus = 'completed'
        }

        if (session.status !== finalStatus) {
          updateStatus(id, finalStatus)
        }

        if (id !== activeSessionRef.current) {
          if (rawStatus === 'needs_input' || rawStatus === 'idle') {
            setHasUnread(id, true)
          }
        }

      },
    })
    return () => sub.unsubscribe()
  }, [updateStatus, setHasUnread])

  // Switch active terminal when workspace changes
  const sessionWorkspaceId = useSessionStore((s) => {
    const aid = s.activeSessionId
    if (!aid) return null
    return s.sessions.get(aid)?.workspaceId ?? null
  })
  const explicitWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const activeWorkspaceId = sessionWorkspaceId ?? explicitWorkspaceId

  useEffect(() => {
    const { terminals, terminalOrder: tOrder, activeTerminalId } = useTerminalStore.getState()
    // If current terminal already belongs to this workspace, keep it
    if (activeTerminalId && activeWorkspaceId && terminals.get(activeTerminalId)?.workspaceId === activeWorkspaceId) return
    if (activeWorkspaceId) {
      const match = tOrder.find((id) => terminals.get(id)?.workspaceId === activeWorkspaceId) ?? null
      setActiveTerminal(match)
    } else if (activeProjectId) {
      // Fallback to project-level matching
      const workspaces = useWorkspaceStore.getState().workspaces
      const match = tOrder.find((id) => {
        const t = terminals.get(id)
        if (!t) return false
        const ws = workspaces.get(t.workspaceId)
        return ws?.projectId === activeProjectId
      }) ?? null
      setActiveTerminal(match)
    }
  }, [activeWorkspaceId, activeProjectId, setActiveTerminal])

  // Listen for shell terminal title changes (process name, cwd, etc.)
  const renameTerminal = useTerminalStore((s) => s.renameTerminal)
  useEffect(() => {
    const sub = trpc.terminal.onTitle.subscribe(undefined, {
      onData: ({ id, title }) => {
        const terminal = useTerminalStore.getState().terminals.get(id)
        if (!terminal) return
        if (title && title !== terminal.name) {
          renameTerminal(id, title)
        }
      },
    })
    return () => sub.unsubscribe()
  }, [renameTerminal])

  // Listen for shell terminal exits
  useEffect(() => {
    const sub = trpc.terminal.onExit.subscribe(undefined, {
      onData: ({ id, exitCode }) => {
        updateTerminalStatus(id, exitCode)
      },
    })
    return () => sub.unsubscribe()
  }, [updateTerminalStatus])
}
