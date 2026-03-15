import { create } from 'zustand'
import { trpc } from '../trpc'
import { useProjectStore } from './projectStore'
import { useNotificationStore } from './notificationStore'
import { getErrorMessage } from '../utils/errors'
import type { ShellTerminal } from '../types'

interface TerminalState {
  terminals: Map<string, ShellTerminal>
  activeTerminalId: string | null
  terminalOrder: string[]

  addTerminal: (terminal: ShellTerminal) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string | null) => void
  updateTerminalStatus: (id: string, exitCode: number) => void
  renameTerminal: (id: string, name: string) => void
  createTerminal: () => Promise<void>
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: new Map(),
  activeTerminalId: null,
  terminalOrder: [],

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

  createTerminal: async () => {
    const { activeProjectId, addProject } = useProjectStore.getState()
    const notify = useNotificationStore.getState().notify

    let cwd = activeProjectId
    if (!cwd) {
      const dir = await trpc.dialog.selectDirectory.query()
      if (!dir) return
      addProject(dir)
      cwd = dir
    }

    const { terminalOrder } = get()
    const name = `Terminal ${terminalOrder.length + 1}`
    try {
      const { id, pid } = await trpc.terminal.create.mutate({ name, cwd })
      get().addTerminal({
        id, name, cwd, status: 'running', createdAt: Date.now(), pid,
      })
    } catch (err: unknown) {
      notify('error', 'Failed to spawn terminal', getErrorMessage(err))
    }
  },
}))
