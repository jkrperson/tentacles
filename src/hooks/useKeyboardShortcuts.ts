import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectStore } from '../stores/projectStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../stores/workspaceStore'
import { useConfirmStore } from '../stores/confirmStore'
import { useUIStore } from '../stores/uiStore'
import { useDictationStore } from '../stores/dictationStore'
import { resolveKeys, parseKeys, matchesEvent } from '../shortcuts'
import { trpc } from '../trpc'

/** Test whether the event matches a shortcut action id, reading custom keybindings from settings. */
function matches(actionId: string, e: KeyboardEvent, custom: Record<string, string>): boolean {
  const keys = resolveKeys(actionId, custom)
  if (!keys) return false
  // Special case: "meta+1-9" is handled separately
  if (keys.includes('1-9')) return false
  const parsed = parseKeys(keys)
  return matchesEvent(parsed, e)
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const custom = useSettingsStore.getState().settings.customKeybindings ?? {}
      const m = (id: string) => matches(id, e, custom)

      // Session create
      if (m('session.create')) {
        e.preventDefault()
        useSessionStore.getState().createSession()
        return
      }

      // Terminal create
      if (m('terminal.create')) {
        e.preventDefault()
        useTerminalStore.getState().createTerminal()
        return
      }

      // Close active tab (session or file depending on what's visible)
      if (m('tab.close')) {
        e.preventDefault()
        const mode = useUIStore.getState().mainPanelMode
        if (mode === 'editor') {
          window.dispatchEvent(new CustomEvent('editor:close-active-tab'))
        } else {
          const { activeSessionId: aid, closeTab } = useSessionStore.getState()
          if (aid) closeTab(aid)
        }
        return
      }

      // Close active session (explicit, regardless of current view)
      if (m('session.close')) {
        e.preventDefault()
        const { activeSessionId: aid, sessions: sess, removeSession: rm } = useSessionStore.getState()
        if (aid) {
          const session = sess.get(aid)
          const isAlive = session?.exitCode == null && (session?.status === 'running' || session?.status === 'idle' || session?.status === 'needs_input')
          const doClose = () => {
            trpc.session.kill.mutate({ id: aid })
            rm(aid)
          }
          if (isAlive) {
            useConfirmStore.getState().show({
              title: `Close ${session!.name}?`,
              message: 'This agent is still active. Closing it will kill the running process.',
              confirmLabel: 'Close',
              onConfirm: doClose,
            })
          } else {
            doClose()
          }
        }
        return
      }

      // Dictation toggle
      if (m('dictation.toggle')) {
        e.preventDefault()
        useDictationStore.getState().toggle()
        return
      }

      // Settings
      if (m('app.settings')) {
        e.preventDefault()
        useSettingsStore.getState().toggleSettings()
        return
      }

      // Show shortcut overlay
      if (m('app.shortcuts')) {
        e.preventDefault()
        useUIStore.getState().toggleShortcutOverlay()
        return
      }

      // Cmd+1-9: switch to session N within active project
      {
        const keys1to9 = resolveKeys('session.switch1-9', custom)
        if (keys1to9.includes('1-9')) {
          const prefix = keys1to9.replace('1-9', '')
          // Parse modifier requirements from prefix (e.g. "meta+" → meta only)
          const wantMeta = prefix.includes('meta')
          const wantShift = prefix.includes('shift')
          const wantAlt = prefix.includes('alt')
          const wantCtrl = prefix.includes('ctrl')
          const isMac = navigator.platform.includes('Mac')
          const metaPressed = isMac ? e.metaKey : e.ctrlKey
          if (
            metaPressed === wantMeta &&
            e.shiftKey === wantShift &&
            e.altKey === wantAlt &&
            (isMac ? e.ctrlKey === wantCtrl : true) &&
            e.key >= '1' && e.key <= '9'
          ) {
            e.preventDefault()
            const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
            const apId = useProjectStore.getState().activeProjectId
            const workspaces = useWorkspaceStore.getState().workspaces
            const projectSessions = apId
              ? order.filter((id) => {
                  const s = sess.get(id)
                  return s && sessionBelongsToProject(s.workspaceId, apId, workspaces)
                })
              : order
            const index = parseInt(e.key) - 1
            if (index < projectSessions.length) {
              setAs(projectSessions[index])
            }
            return
          }
        }
      }

      // Next / previous project
      if (m('project.next') || m('project.prev')) {
        e.preventDefault()
        const { projectOrder: pOrder, activeProjectId: apId, setActiveProject: setAp } = useProjectStore.getState()
        if (pOrder.length < 2) return
        const currentIdx = apId ? pOrder.indexOf(apId) : -1
        const forward = m('project.next')
        let nextIdx: number
        if (forward) {
          nextIdx = currentIdx < pOrder.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : pOrder.length - 1
        }
        const nextProject = pOrder[nextIdx]
        setAp(nextProject)
        const { sessionOrder: order, sessions: sess, setActiveSession: setAs } = useSessionStore.getState()
        const workspaces = useWorkspaceStore.getState().workspaces
        const firstSession = order.find((id) => {
          const s = sess.get(id)
          return s && sessionBelongsToProject(s.workspaceId, nextProject, workspaces)
        })
        if (firstSession) setAs(firstSession)
        return
      }

      // Spawn agent dialog
      if (m('session.spawnDialog')) {
        e.preventDefault()
        const apId = useProjectStore.getState().activeProjectId
        if (apId) useUIStore.getState().openSpawnDialog(apId)
        return
      }

      // Rename active session
      if (m('session.rename')) {
        e.preventDefault()
        const aid = useSessionStore.getState().activeSessionId
        if (aid) useUIStore.getState().setRenamingSessionId(aid)
        return
      }

      // Next / previous tab (unified tab bar: sessions + files)
      if (m('tab.next') || m('tab.prev')) {
        e.preventDefault()
        const direction = m('tab.next') ? 'next' : 'prev'
        window.dispatchEvent(new CustomEvent('tabs:cycle', { detail: { direction } }))
        return
      }

      // Add project
      if (m('project.add')) {
        e.preventDefault()
        const addProject = useProjectStore.getState().addProject
        trpc.dialog.selectDirectory.query().then((dir) => {
          if (dir) addProject(dir)
        })
        return
      }

      // Remove current project
      if (m('project.remove')) {
        e.preventDefault()
        const { activeProjectId: apId, removeProject, projects } = useProjectStore.getState()
        if (apId) {
          const project = projects.get(apId)
          useConfirmStore.getState().show({
            title: `Remove ${project?.name ?? 'project'}?`,
            message: 'This will remove the project from the sidebar. No files will be deleted.',
            confirmLabel: 'Remove',
            onConfirm: () => removeProject(apId),
          })
        }
        return
      }

      // New worktree workspace
      if (m('project.newWorktree')) {
        e.preventDefault()
        const apId = useProjectStore.getState().activeProjectId
        if (apId) useUIStore.getState().openWorktreeDialog(apId)
        return
      }

      // Toggle terminal panel
      if (m('terminal.toggle')) {
        e.preventDefault()
        const { bottomPanelExpanded, setBottomPanelExpanded } = useTerminalStore.getState()
        setBottomPanelExpanded(!bottomPanelExpanded)
        return
      }

      // Next / previous terminal (within active workspace)
      if (m('terminal.next') || m('terminal.prev')) {
        e.preventDefault()
        const { terminalOrder, terminals, activeTerminalId, setActiveTerminal, bottomPanelExpanded, setBottomPanelExpanded } = useTerminalStore.getState()
        // Derive active workspace
        const { activeSessionId: aid, sessions: sess } = useSessionStore.getState()
        const activeWsId = (aid ? sess.get(aid)?.workspaceId : null) ?? useUIStore.getState().activeWorkspaceId
        // Filter to workspace terminals
        const wsTerminals = activeWsId
          ? terminalOrder.filter((id) => terminals.get(id)?.workspaceId === activeWsId)
          : terminalOrder
        if (wsTerminals.length < 2) return
        const currentIdx = activeTerminalId ? wsTerminals.indexOf(activeTerminalId) : -1
        const forward = m('terminal.next')
        let nextIdx: number
        if (forward) {
          nextIdx = currentIdx < wsTerminals.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : wsTerminals.length - 1
        }
        setActiveTerminal(wsTerminals[nextIdx])
        if (!bottomPanelExpanded) setBottomPanelExpanded(true)
        return
      }

      // Close active terminal
      if (m('terminal.close')) {
        e.preventDefault()
        const { activeTerminalId, terminals, removeTerminal } = useTerminalStore.getState()
        if (activeTerminalId) {
          const terminal = terminals.get(activeTerminalId)
          if (terminal?.status === 'running') {
            trpc.terminal.kill.mutate({ id: activeTerminalId })
          }
          removeTerminal(activeTerminalId)
        }
        return
      }

      // Focus terminal panel
      if (m('terminal.focus')) {
        e.preventDefault()
        const { bottomPanelExpanded, setBottomPanelExpanded, activeTerminalId } = useTerminalStore.getState()
        if (!bottomPanelExpanded) setBottomPanelExpanded(true)
        if (activeTerminalId) {
          requestAnimationFrame(() => {
            const termEl = document.querySelector(`[data-terminal-id="${activeTerminalId}"] .xterm-helper-textarea`) as HTMLElement
            termEl?.focus()
          })
        }
        return
      }
    }

    // Handle shortcuts forwarded from Electron menu accelerators (e.g. Cmd+` on macOS)
    const menuHandler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail
      if (action === 'terminal.create') {
        useTerminalStore.getState().createTerminal()
      }
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('menu-shortcut', menuHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('menu-shortcut', menuHandler)
    }
  }, [])
}
