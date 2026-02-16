import { create } from 'zustand'
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
}

export const useTerminalStore = create<TerminalState>((set) => ({
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
}))
