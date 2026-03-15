import { useEffect, useRef } from 'react'
import { trpc } from '../trpc'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useProjectStore } from '../stores/projectStore'
import { useNotificationStore } from '../stores/notificationStore'

export function useSessionSubscriptions() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const updateStatus = useSessionStore((s) => s.updateStatus)
  const setHasUnread = useSessionStore((s) => s.setHasUnread)
  const acknowledgeSession = useSessionStore((s) => s.acknowledgeSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const setClaudeSessionId = useSessionStore((s) => s.setClaudeSessionId)
  const setStatusDetail = useSessionStore((s) => s.setStatusDetail)
  const updateTerminalStatus = useTerminalStore((s) => s.updateTerminalStatus)
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const notify = useNotificationStore((s) => s.notify)

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
        const session = useSessionStore.getState().sessions.get(id)
        notify(
          exitCode === 0 ? 'success' : 'error',
          `${session?.name ?? 'Agent'} finished`,
          `Exit code: ${exitCode}`,
          id,
        )
      },
    })
    return () => sub.unsubscribe()
  }, [updateStatus, notify, setHasUnread])

  // Capture Claude CLI session ID for resume support
  useEffect(() => {
    const sub = trpc.session.onClaudeSessionId.subscribe(undefined, {
      onData: ({ id, claudeSessionId }) => {
        setClaudeSessionId(id, claudeSessionId)
      },
    })
    return () => sub.unsubscribe()
  }, [setClaudeSessionId])

  // Listen for detailed status updates from hook events
  useEffect(() => {
    const sub = trpc.session.onStatusDetail.subscribe(undefined, {
      onData: ({ id, detail }) => {
        setStatusDetail(id, detail)
      },
    })
    return () => sub.unsubscribe()
  }, [setStatusDetail])

  // Listen for agent status changes from hook events
  useEffect(() => {
    const sub = trpc.session.onAgentStatus.subscribe(undefined, {
      onData: ({ id, status: rawStatus }) => {
        const session = useSessionStore.getState().sessions.get(id)
        if (!session || session.status === 'errored') return
        if (session.exitCode != null) return

        let finalStatus = rawStatus
        if (rawStatus === 'idle' && id !== activeSessionRef.current) {
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

        if (rawStatus === 'needs_input') {
          notify('warning', `${session.name} needs input`, 'Agent is waiting for permission', id)
        } else if (rawStatus === 'idle') {
          notify('info', `${session.name} finished`, 'Agent completed its task', id)
        }
      },
    })
    return () => sub.unsubscribe()
  }, [updateStatus, notify, setHasUnread])

  // Switch active terminal when project changes
  useEffect(() => {
    const { terminals, terminalOrder: tOrder, activeTerminalId } = useTerminalStore.getState()
    if (activeTerminalId && terminals.get(activeTerminalId)?.cwd === activeProjectId) return
    const match = activeProjectId
      ? tOrder.find((id) => terminals.get(id)?.cwd === activeProjectId) ?? null
      : tOrder[0] ?? null
    setActiveTerminal(match)
  }, [activeProjectId, setActiveTerminal])

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
