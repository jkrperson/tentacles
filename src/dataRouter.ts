/**
 * Single-listener data router for terminal IPC.
 *
 * Instead of N panels each subscribing to the global onData IPC channel
 * (O(N) fan-out per data chunk), one listener dispatches directly to the
 * registered write callback via a Map lookup (O(1)).
 */

type WriteCallback = (data: string) => void

const sessionWriters = new Map<string, WriteCallback>()
const terminalWriters = new Map<string, WriteCallback>()

export function registerSessionWriter(id: string, cb: WriteCallback): () => void {
  sessionWriters.set(id, cb)
  return () => { sessionWriters.delete(id) }
}

export function registerTerminalWriter(id: string, cb: WriteCallback): () => void {
  terminalWriters.set(id, cb)
  return () => { terminalWriters.delete(id) }
}

/** Call once at app startup. Returns a cleanup function. */
export function initDataRouter(onUnreadData?: (id: string) => void): () => void {
  const unsubSession = window.electronAPI.session.onData(({ id, data }) => {
    sessionWriters.get(id)?.(data)
    onUnreadData?.(id)
  })
  const unsubTerminal = window.electronAPI.terminal.onData(({ id, data }) => {
    terminalWriters.get(id)?.(data)
  })
  return () => { unsubSession(); unsubTerminal() }
}
