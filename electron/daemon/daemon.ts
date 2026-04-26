// Terminal daemon — a standalone Node.js process that manages PTYs
// and survives Electron restarts. Communicates via Unix domain socket.
//
// Launched with ELECTRON_RUN_AS_NODE=1 so it runs as plain Node.js.

import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { ScrollbackWriter, readScrollback, removeScrollback } from './scrollback'
import {
  DAEMON_PROTOCOL_VERSION,
  DAEMON_REQUIRED_CAPABILITIES,
} from './protocol'
import type { TaggedRequest, DaemonResponse, DaemonEvent } from './protocol'
import { openDb, closeDb } from './db'
import { createSessionStore } from './sessionStore'
import { createProjectStore } from './projectStore'
import { createWorkspaceStore } from './workspaceStore'

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
const DB_PATH = path.join(DAEMON_DIR, 'state.db')
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

interface ManagedSession {
  id: string
  ptyProcess: PtyProcess
  scrollback: ScrollbackWriter
  // Data coalescing
  dataBuffer: string
  flushScheduled: boolean
}

const db = openDb(DB_PATH)
const sessionDb = createSessionStore(db)
const projectDb = createProjectStore(db)
const workspaceDb = createWorkspaceStore(db)

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
      let scrollback: ScrollbackWriter | null = null
      let ptyProcess: PtyProcess | null = null
      let mapInserted = false
      let dbInserted = false

      try {
        scrollback = new ScrollbackWriter(sessionDir, request.cols, request.rows, request.cwd)

        ptyProcess = pty.spawn(request.command, request.args, {
          name: 'xterm-256color',
          cols: request.cols,
          rows: request.rows,
          cwd: request.cwd,
          env: {
            ...process.env,
            ...request.env,
            TERM: 'xterm-256color',
          },
        }) as PtyProcess

        const session: ManagedSession = {
          id: request.id,
          ptyProcess,
          scrollback,
          dataBuffer: '',
          flushScheduled: false,
        }
        sessions.set(request.id, session)
        mapInserted = true

        const now = Date.now()
        sessionDb.insert({
          id: request.id,
          pid: ptyProcess.pid,
          cwd: request.cwd,
          createdAt: now,
          name: request.metadata.name,
          agentType: request.metadata.agentType,
          workspaceId: request.metadata.workspaceId,
          hookId: request.metadata.hookId,
          status: 'idle',
          exitCode: null,
          lastActivity: now,
        })
        dbInserted = true

        // Wire listeners only after both map and DB are populated.
        ptyProcess.onData((data: string) => {
          scrollback!.write(data)

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
          scrollback!.close()
          sessionDb.setStatus(session.id, exitCode === 0 ? 'completed' : 'errored', exitCode)
          sessionDb.delete(session.id)
          sessions.delete(request.id)
          broadcast({ event: 'exit', id: request.id, exitCode })
          broadcast({ event: 'sessionsChanged' })
          resetIdleTimer()
        })

        broadcast({ event: 'sessionsChanged' })
        sendTo(client, { ok: true, reqId, pid: ptyProcess.pid })
      } catch (err) {
        // Tear down whatever we managed to create, in reverse order.
        if (dbInserted) {
          try { sessionDb.delete(request.id) } catch { /* ignore */ }
        }
        if (mapInserted) {
          sessions.delete(request.id)
        }
        if (ptyProcess) {
          try { ptyProcess.kill() } catch { /* ignore */ }
        }
        if (scrollback) {
          try { scrollback.close() } catch { /* ignore */ }
          try { removeScrollback(sessionDir) } catch { /* ignore */ }
        }

        const message = err instanceof Error ? err.message : String(err)
        console.error(`[daemon] spawn failed id="${request.id}" command="${request.command}" cwd="${request.cwd}":`, message)
        sendTo(client, { ok: false, reqId, error: `Spawn failed: ${message}` })
      }
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
      const list = sessionDb.list().map((s) => ({
        id: s.id,
        pid: s.pid,
        cwd: s.cwd,
        createdAt: s.createdAt,
        name: s.name,
        agentType: s.agentType,
        workspaceId: s.workspaceId,
        hookId: s.hookId,
        status: s.status,
        exitCode: s.exitCode,
      }))
      sendTo(client, { ok: true, reqId, sessions: list })
      break
    }

    case 'setSessionStatus': {
      const changed = sessionDb.setStatus(request.id, request.status, request.exitCode ?? null)
      if (changed) broadcast({ event: 'sessionsChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'renameSession': {
      const changed = sessionDb.rename(request.id, request.name)
      if (changed) broadcast({ event: 'sessionsChanged' })
      sendTo(client, { ok: true, reqId })
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
      sendTo(client, {
        ok: true,
        reqId,
        uptime: Date.now() - startTime,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        capabilities: [...DAEMON_REQUIRED_CAPABILITIES],
      })
      break
    }

    case 'listProjects': {
      const list = projectDb.list().map((p) => ({
        id: p.id, path: p.path, name: p.name,
        color: p.color, icon: p.icon,
        addedAt: p.addedAt, sortOrder: p.sortOrder,
      }))
      sendTo(client, { ok: true, reqId, projects: list })
      break
    }

    case 'addProject': {
      projectDb.insert({
        id: request.id,
        path: request.metadata.path,
        name: request.metadata.name,
        color: request.metadata.color,
        icon: request.metadata.icon,
        addedAt: Date.now(),
        sortOrder: request.sortOrder,
      })
      broadcast({ event: 'projectsChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'updateProject': {
      const changed = projectDb.update(request.id, request.patch)
      if (changed) broadcast({ event: 'projectsChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'removeProject': {
      const changed = projectDb.delete(request.id)
      if (changed) {
        // FK cascade removes workspaces too — emit both events.
        broadcast({ event: 'workspacesChanged' })
        broadcast({ event: 'projectsChanged' })
      }
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'reorderProjects': {
      projectDb.reorder(request.idsInOrder)
      broadcast({ event: 'projectsChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'listWorkspaces': {
      const list = (request.projectId ? workspaceDb.listByProject(request.projectId) : workspaceDb.listAll())
        .map((w) => ({
          id: w.id, projectId: w.projectId, type: w.type, branch: w.branch,
          worktreePath: w.worktreePath, linkedPr: w.linkedPr, linkedIssue: w.linkedIssue,
          status: w.status, name: w.name, createdAt: w.createdAt, sortOrder: w.sortOrder,
        }))
      sendTo(client, { ok: true, reqId, workspaces: list })
      break
    }

    case 'addWorkspace': {
      workspaceDb.insert({
        id: request.id,
        projectId: request.metadata.projectId,
        type: request.metadata.type,
        branch: request.metadata.branch,
        worktreePath: request.metadata.worktreePath,
        linkedPr: request.metadata.linkedPr,
        linkedIssue: request.metadata.linkedIssue,
        status: request.metadata.status,
        name: request.metadata.name,
        createdAt: Date.now(),
        sortOrder: request.sortOrder,
      })
      broadcast({ event: 'workspacesChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'updateWorkspace': {
      const changed = workspaceDb.update(request.id, request.patch)
      if (changed) broadcast({ event: 'workspacesChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'removeWorkspace': {
      const changed = workspaceDb.delete(request.id)
      if (changed) broadcast({ event: 'workspacesChanged' })
      sendTo(client, { ok: true, reqId })
      break
    }

    case 'reorderWorkspaces': {
      workspaceDb.reorder(request.projectId, request.idsInOrder)
      broadcast({ event: 'workspacesChanged' })
      sendTo(client, { ok: true, reqId })
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
  try { closeDb() } catch { /* ignore */ }

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
