import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectStore } from '../stores/projectStore'
import { useTerminalStore } from '../stores/terminalStore'
import { trpc } from '../trpc'

export function useKeyboardShortcuts() {
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 't') {
        e.preventDefault()
        useSessionStore.getState().createSession()
      }

      if (meta && e.key === '`') {
        e.preventDefault()
        useTerminalStore.getState().createTerminal()
      }

      if (meta && e.key === 'w') {
        e.preventDefault()
        const { activeSessionId: aid, sessions: sess, removeSession: rm } = useSessionStore.getState()
        if (aid) {
          const session = sess.get(aid)
          if (session?.status === 'running' || session?.status === 'idle' || session?.status === 'needs_input') {
            trpc.session.kill.mutate({ id: aid })
          }
          rm(aid)
        }
      }

      if (meta && e.key === ',') {
        e.preventDefault()
        toggleSettings()
      }

      // Cmd+1-9: cycle through sessions within the active project
      if (meta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
        const apId = useProjectStore.getState().activeProjectId
        const projectSessions = apId
          ? order.filter((id) => sess.get(id)?.cwd === apId)
          : order
        const index = parseInt(e.key) - 1
        if (index < projectSessions.length) {
          setAs(projectSessions[index])
        }
      }

      // Cmd+Shift+[ / ] — switch between projects
      if (meta && e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const { projectOrder: pOrder, activeProjectId: apId, setActiveProject: setAp } = useProjectStore.getState()
        if (pOrder.length < 2) return
        const currentIdx = apId ? pOrder.indexOf(apId) : -1
        let nextIdx: number
        if (e.key === ']') {
          nextIdx = currentIdx < pOrder.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : pOrder.length - 1
        }
        const nextProject = pOrder[nextIdx]
        setAp(nextProject)
        const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
        const firstSession = order.find((id) => sess.get(id)?.cwd === nextProject)
        if (firstSession) setAs(firstSession)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSettings])
}
