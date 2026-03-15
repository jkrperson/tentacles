import { trpc } from '../trpc'
import { useBaseTerminal } from './useBaseTerminal'

interface UseShellTerminalOptions {
  terminalId: string
  isActive: boolean
}

const write = (id: string, data: string) => trpc.terminal.write.mutate({ id, data })
const resize = (id: string, cols: number, rows: number) => trpc.terminal.resize.mutate({ id, cols, rows })

export function useShellTerminal({ terminalId, isActive }: UseShellTerminalOptions) {
  return useBaseTerminal({
    id: terminalId,
    isActive,
    write,
    resize,
  })
}
