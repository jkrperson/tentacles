// Terminal daemon — a standalone Node.js process that manages PTYs
// and survives Electron restarts. Communicates via Unix domain socket.
//
// Launched with ELECTRON_RUN_AS_NODE=1 so it runs as plain Node.js.

import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { ScrollbackWriter, readScrollback } from './scrollback'
import type { TaggedRequest, DaemonResponse, DaemonEvent } from './protocol'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

interface PtyProcess {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  onExit(callback: (e: { exitCode: number }) => void): void
}

const DAEMON_DIR = process.env.TENTACLES_DAEMON_DIR!
const SOCKET_PATH = path.join(DAEMON_DIR, 'daemon.sock')
const PID_FILE = path.join(DAEMON_DIR, 'daemon.pid')
const SCROLLBACK_DIR = path.join(DAEMON_DIR, 'scrollback')
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

interface ManagedSession {
  id: string
  pid: number
  cwd: string
  createdAt: number
  ptyProcess: PtyProcess
  scrollback: ScrollbackWriter
  // Data coalescing
  dataBuffer: string
  flushScheduled: boolean
}

const sessions = new Map<string, ManagedSession>()
const clients = new Set<net.Socket>()
let idleTimer: ReturnType<typeof setTimeout> | null = null
const startTime = Date.now()

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (sessions.size === 0 && clients.size === 0) {
      console.log('[daemon] Idle timeout — exiting')
      cleanup()
      process.exit(0)
    }
  }, IDLE_TIMEOUT_MS)
}

function broadcast(msg: DaemonResponse | DaemonEvent) {
  const line = JSON.stringify(msg) + '\n'
  for (const client of clients) {
    try { client.write(line) } catch { /* client gone */ }
  }
}

function sendTo(client: net.Socket, msg: DaemonResponse | DaemonEvent) {
  try { client.write(JSON.stringify(msg) + '\n') } catch { /* client gone */ }
}

function handleRequest(client: net.Socket, tagged: TaggedRequest) {
  const { reqId, request } = tagged
  resetIdleTimer()

  switch (request.method) {
    case 'spawn': {
      const sessionDir = path.join(SCROLLBACK_DIR, request.id)
      const scrollback = new ScrollbackWriter(sessionDir, request.cols, request.rows, request.cwd)

      const ptyProcess: PtyProcess = pty.spawn(request.command, request.args, {
        name: 'xterm-256color',
        cols: request.cols,
        rows: request.rows,
        cwd: request.cwd,
        env: {
          ...process.env,
          ...request.env,
          TERM: 'xterm-256color',
        },
      })

      const session: ManagedSession = {
        id: request.id,
        pid: ptyProcess.pid,
        cwd: request.cwd,
        createdAt: Date.now(),
        ptyProcess,
        scrollback,
        dataBuffer: '',
        flushScheduled: false,
      }
      sessions.set(request.id, session)

      ptyProcess.onData((data: string) => {
        scrollback.write(data)

        // Coalesce data and flush via setImmediate
        session.dataBuffer += data
        if (!session.flushScheduled) {
          session.flushScheduled = true
          setImmediate(() => {
            session.flushScheduled = false
            if (session.dataBuffer) {
              const event: DaemonEvent = { event: 'data', id: session.id, data: session.dataBuffer }
              session.dataBuffer = ''
              broadcast(event)
            }
          })
        }
      })

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        // Flush any buffered data before broadcasting exit,
        // so clients see output from short-lived processes.
        if (session.dataBuffer) {
          const event: DaemonEvent = { event: 'data', id: session.id, data: session.dataBuffer }
          session.dataBuffer = ''
          session.flushScheduled = false
          broadcast(event)
        }
        scrollback.close()
        sessions.delete(request.id)
        broadcast({ event: 'exit', id: request.id, exitCode })
        resetIdleTimer()
      })

      sendTo(client, { ok: true, reqId, pid: ptyProcess.pid })
      break
    }

    case 'write': {
      const s = sessions.get(request.id)
      if (s) {
        s.ptyProcess.write(request.data)
        sendTo(client, { ok: true, reqId })
      } else {
        sendTo(client, { ok: false, reqId, error: `Session ${request.id} not found` })
      }
      break
    }

    case 'resize': {
      const s = sessions.get(request.id)
      if (s) {
        try {
          s.ptyProcess.resize(request.cols, request.rows)
          s.scrollback.updateSize(request.cols, request.rows)
        } catch { /* dead process */ }
        sendTo(client, { ok: true, reqId })
      } else {
        sendTo(client, { ok: false, reqId, error: `Session ${request.id} not found` })
      }
      break
    }

    case 'kill': {
      const s = sessions.get(request.id)
      if (s) {
        s.ptyProcess.kill()
        sendTo(client, { ok: true, reqId })
      } else {
        sendTo(client, { ok: true, reqId }) // idempotent
      }
      break
    }

    case 'list': {
      const list = Array.from(sessions.values()).map((s) => ({
        id: s.id,
        pid: s.pid,
        cwd: s.cwd,
        createdAt: s.createdAt,
      }))
      sendTo(client, { ok: true, reqId, sessions: list })
      break
    }

    case 'getScrollback': {
      const sessionDir = path.join(SCROLLBACK_DIR, request.id)
      try {
        const data = readScrollback(sessionDir)
        sendTo(client, { ok: true, reqId, data })
      } catch {
        sendTo(client, { ok: true, reqId, data: '' })
      }
      break
    }

    case 'ping': {
      sendTo(client, { ok: true, reqId, uptime: Date.now() - startTime })
      break
    }

    default:
      sendTo(client, { ok: false, reqId, error: `Unknown method` })
  }
}

function cleanup() {
  // Close all sessions
  for (const [, session] of sessions) {
    try { session.ptyProcess.kill() } catch { /* ignore */ }
    try { session.scrollback.close() } catch { /* ignore */ }
  }
  sessions.clear()

  // Clean up socket and pid file
  try { fs.unlinkSync(SOCKET_PATH) } catch { /* ignore */ }
  try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
}

// --- Start server ---
fs.mkdirSync(SCROLLBACK_DIR, { recursive: true })

// Clean up stale socket
try { fs.unlinkSync(SOCKET_PATH) } catch { /* ignore */ }

const server = net.createServer((client) => {
  clients.add(client)
  resetIdleTimer()

  let buffer = ''

  client.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx)
      buffer = buffer.slice(newlineIdx + 1)
      if (!line.trim()) continue
      try {
        const tagged = JSON.parse(line) as TaggedRequest
        handleRequest(client, tagged)
      } catch (err) {
        console.error('[daemon] Bad message:', err)
      }
    }
  })

  client.on('close', () => {
    clients.delete(client)
    resetIdleTimer()
  })

  client.on('error', () => {
    clients.delete(client)
  })
})

server.listen(SOCKET_PATH, () => {
  // Write our actual PID
  fs.writeFileSync(PID_FILE, String(process.pid))
  console.log(`[daemon] Listening on ${SOCKET_PATH} (pid ${process.pid})`)
  resetIdleTimer()
})

server.on('error', (err) => {
  console.error('[daemon] Server error:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[daemon] SIGTERM received')
  cleanup()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[daemon] SIGINT received')
  cleanup()
  process.exit(0)
})
