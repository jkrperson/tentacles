import { useMemo } from 'react'
import { TerminalTabs } from './TerminalTabs'
import { TerminalPanel } from './TerminalPanel'
import { EditorPanel } from '../editor/EditorPanel'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { useActiveWorkspaceDir } from '../../hooks/useActiveWorkspaceDir'

export function TerminalView() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const sessions = useSessionStore((s) => s.sessions)
  const createSession = useSessionStore((s) => s.createSession)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const fileTreeCache = useProjectStore((s) => s.fileTreeCache)
  const mainPanelMode = useUIStore((s) => s.mainPanelMode)
  const setRightSidebarVisible = useUIStore((s) => s.setRightSidebarVisible)
  const setRightSidebarTab = useUIStore((s) => s.setRightSidebarTab)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const { dir: workspaceDir } = useActiveWorkspaceDir()
  const sessionWorkspaceId = useSessionStore((s) => {
    const aid = s.activeSessionId
    if (!aid) return null
    return s.sessions.get(aid)?.workspaceId ?? null
  })
  const explicitWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const activeWorkspaceId = sessionWorkspaceId ?? explicitWorkspaceId

  const workspaceSessions = useMemo(
    () => {
      if (!activeWorkspaceId) {
        return activeProjectId
          ? sessionOrder.filter((id) => {
              const session = sessions.get(id)
              return session ? sessionBelongsToProject(session.workspaceId, activeProjectId, workspaces) : false
            })
          : sessionOrder
      }
      return sessionOrder.filter((id) => sessions.get(id)?.workspaceId === activeWorkspaceId)
    },
    [sessionOrder, sessions, activeProjectId, activeWorkspaceId, workspaces],
  )

  const cacheKey = workspaceDir ?? activeProjectId
  const openFiles = cacheKey ? fileTreeCache.get(cacheKey)?.openFiles ?? [] : []
  const openDiffs = cacheKey ? fileTreeCache.get(cacheKey)?.openDiffs ?? [] : []
  const hasAnyTabs = workspaceSessions.length > 0 || openFiles.length > 0 || openDiffs.length > 0

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      <TerminalTabs />
      <div className="flex-1 min-h-0 relative">
        {/* Editor panel — shown when mainPanelMode is 'editor' */}
        {mainPanelMode === 'editor' && (
          <div className="absolute inset-0 z-10">
            <EditorPanel />
          </div>
        )}

        {/* Empty state — when there are no tabs in this workspace */}
        {mainPanelMode === 'session' && !hasAnyTabs && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-zinc-500 text-[15px] mb-2">
                {activeProjectId ? 'No tabs open in this workspace' : 'No tabs open'}
              </div>
              <div className="text-zinc-600 text-[12px] mb-3">
                Open a file from Explorer or spawn an agent to start a tab.
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    setRightSidebarVisible(true)
                    setRightSidebarTab('explorer')
                  }}
                  className="px-3 py-1.5 border border-[var(--t-border)] text-zinc-300 hover:bg-[var(--t-bg-hover)] text-[12px] transition-colors"
                >
                  Open Explorer
                </button>
                <button
                  onClick={() => createSession()}
                  className="px-3 py-1.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-white text-[12px] transition-colors"
                >
                  Spawn Agent
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ALL terminal panels stay mounted across all projects — only visibility changes */}
        {sessionOrder.map((id) => (
          <TerminalPanel key={id} sessionId={id} isActive={id === activeSessionId && mainPanelMode === 'session'} />
        ))}
      </div>
    </div>
  )
}
