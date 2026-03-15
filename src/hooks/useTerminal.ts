import { trpc } from '../trpc'
import { useBaseTerminal } from './useBaseTerminal'

interface UseTerminalOptions {
  sessionId: string
  isActive: boolean
}

const write = (id: string, data: string) => trpc.session.write.mutate({ id, data })
const resize = (id: string, cols: number, rows: number) => trpc.session.resize.mutate({ id, cols, rows })
const getScrollback = (id: string) => trpc.session.getScrollback.query({ id })

export function useTerminal({ sessionId, isActive }: UseTerminalOptions) {
  return useBaseTerminal({
    id: sessionId,
    isActive,
    write,
    resize,
    getScrollback,
    focusOnActivate: true,
  })
}
