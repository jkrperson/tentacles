import { create } from 'zustand'
import { trpc } from '../trpc'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore } from './workspaceStore'
import { useSessionStore } from './sessionStore'
import { useUIStore } from './uiStore'
import { getErrorMessage } from '../utils/errors'
import type { ShellTerminal } from '../types'

interface TerminalState {
  terminals: Map<string, ShellTerminal>
  activeTerminalId: string | null
  terminalOrder: string[]
  bottomPanelExpanded: boolean

  addTerminal: (terminal: ShellTerminal) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string | null) => void
  updateTerminalStatus: (id: string, exitCode: number) => void
  renameTerminal: (id: string, name: string) => void
  setBottomPanelExpanded: (expanded: boolean) => void
  createTerminal: (workspaceId?: string) => Promise<void>
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: new Map(),
  activeTerminalId: null,
  terminalOrder: [],
  bottomPanelExpanded: false,

  addTerminal: (terminal) =>
    set((state) => {
      const terminals = new Map(state.terminals)
      terminals.set(terminal.id, terminal)
      return {
        terminals,
        terminalOrder: [...state.terminalOrder, terminal.id],
        activeTerminalId: terminal.id,
      }
    }),

  removeTerminal: (id) =>
    set((state) => {
      const terminals = new Map(state.terminals)
      terminals.delete(id)
      const terminalOrder = state.terminalOrder.filter((tid) => tid !== id)
      const activeTerminalId =
        state.activeTerminalId === id
          ? terminalOrder[terminalOrder.length - 1] ?? null
          : state.activeTerminalId
      return { terminals, terminalOrder, activeTerminalId }
    }),

  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  updateTerminalStatus: (id, exitCode) =>
    set((state) => {
      const terminal = state.terminals.get(id)
      if (!terminal) return state
      const terminals = new Map(state.terminals)
      terminals.set(id, { ...terminal, status: 'exited', exitCode })
      return { terminals }
    }),

  renameTerminal: (id, name) =>
    set((state) => {
      const terminal = state.terminals.get(id)
      if (!terminal) return state
      const terminals = new Map(state.terminals)
      terminals.set(id, { ...terminal, name })
      return { terminals }
    }),

  setBottomPanelExpanded: (expanded) => set({ bottomPanelExpanded: expanded }),

  createTerminal: async (workspaceId?: string) => {
    const { activeProjectId, addProject } = useProjectStore.getState()
    const wsStore = useWorkspaceStore.getState()

    let resolvedWsId = workspaceId
    let cwd: string | null = null

    if (resolvedWsId) {
      cwd = wsStore.getWorkspaceCwd(resolvedWsId)
    }

    if (!cwd) {
      // Resolve active workspace from session context or explicit UI selection
      const activeSession = useSessionStore.getState()
      const activeSessionWsId = activeSession.activeSessionId
        ? activeSession.sessions.get(activeSession.activeSessionId)?.workspaceId ?? null
        : null
      const explicitWsId = useUIStore.getState().activeWorkspaceId
      const inferredWsId = activeSessionWsId ?? explicitWsId

      if (inferredWsId) {
        resolvedWsId = inferredWsId
        cwd = wsStore.getWorkspaceCwd(inferredWsId)
      }

      if (!cwd) {
        // Fall back to active project's main workspace
        let projectId = activeProjectId
        if (!projectId) {
          const dir = await trpc.dialog.selectDirectory.query()
          if (!dir) return
          addProject(dir)
          projectId = dir
        }
        const mainWs = wsStore.ensureMainWorkspace(projectId)
        resolvedWsId = mainWs.id
        cwd = projectId
      }
    }

    set({ bottomPanelExpanded: true })

    const { terminalOrder } = get()
    const name = `Terminal ${terminalOrder.length + 1}`
    try {
      const { id, pid } = await trpc.terminal.create.mutate({ name, cwd })
      get().addTerminal({
        id, name, cwd, status: 'running', createdAt: Date.now(), pid,
        workspaceId: resolvedWsId!,
      })
    } catch (err: unknown) {
      console.error('Failed to spawn terminal', getErrorMessage(err))
    }
  },
}))
