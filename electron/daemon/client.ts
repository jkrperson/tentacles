// Typed client for communicating with the terminal daemon from Electron main process.

import * as net from 'node:net'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getSocketPath, ensureDaemon, isDaemonRunning } from './launcher'
import type {
  DaemonRequest,
  DaemonResponse,
  DaemonEvent,
  TaggedRequest,
  ListSession,
} from './protocol'

type PendingResolve = (response: DaemonResponse) => void

export class DaemonClient extends EventEmitter {
  private socket: net.Socket | null = null
  private pending = new Map<string, PendingResolve>()
  private buffer = ''
  private connected = false
  private reconnecting = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalDisconnect = false

  /** Ensure the daemon is running and connect to it. */
  async ensureAndConnect(): Promise<void> {
    const launched = ensureDaemon()
    // If we just spawned the daemon, wait for its socket to appear
    if (launched) {
      await this.waitForDaemon(5000)
    }
    await this.connect()
  }

  /** Connect to the daemon socket. */
  async connect(): Promise<void> {
    if (this.connected) return

    return new Promise((resolve, reject) => {
      const socketPath = getSocketPath()
      const socket = net.createConnection(socketPath)

      socket.on('connect', () => {
        this.socket = socket
        this.connected = true
        this.reconnecting = false
        this.buffer = ''
        resolve()
      })

      socket.on('data', (chunk) => {
        this.buffer += chunk.toString()
        let newlineIdx: number
        while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIdx)
          this.buffer = this.buffer.slice(newlineIdx + 1)
          if (!line.trim()) continue
          try {
            this.handleMessage(JSON.parse(line))
          } catch { /* bad JSON */ }
        }
      })

      socket.on('close', () => {
        this.connected = false
        this.socket = null
        // Reject all pending requests
        for (const [, cb] of this.pending) {
          cb({ ok: false, reqId: '', error: 'Connection closed' })
        }
        this.pending.clear()
        this.emit('disconnected')
        // Only reconnect if this wasn't an intentional disconnect
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect()
        }
      })

      socket.on('error', (err) => {
        if (!this.connected) {
          reject(err)
        }
      })
    })
  }

  private handleMessage(msg: DaemonResponse | DaemonEvent) {
    // Events (no reqId)
    if ('event' in msg) {
      const event = msg as DaemonEvent
      this.emit(event.event, event)
      return
    }

    // Responses
    const response = msg as DaemonResponse
    const cb = this.pending.get(response.reqId)
    if (cb) {
      this.pending.delete(response.reqId)
      cb(response)
    }
  }

  private async send(request: DaemonRequest): Promise<DaemonResponse> {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected to daemon')
    }

    const reqId = randomUUID()
    const tagged: TaggedRequest = { reqId, request }

    return new Promise((resolve, reject) => {
      this.pending.set(reqId, resolve)
      this.socket!.write(JSON.stringify(tagged) + '\n', (err) => {
        if (err) {
          this.pending.delete(reqId)
          reject(err)
        }
      })

      // Timeout after 10s
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId)
          reject(new Error(`Request ${request.method} timed out`))
        }
      }, 10000)
    })
  }

  async spawn(id: string, command: string, args: string[], cwd: string, env: Record<string, string>, cols = 120, rows = 30): Promise<{ pid: number }> {
    const resp = await this.send({ method: 'spawn', id, command, args, cwd, env, cols, rows })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
    return { pid: (resp as { pid: number }).pid }
  }

  async write(id: string, data: string): Promise<void> {
    const resp = await this.send({ method: 'write', id, data })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    const resp = await this.send({ method: 'resize', id, cols, rows })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
  }

  async kill(id: string): Promise<void> {
    const resp = await this.send({ method: 'kill', id })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
  }

  async list(): Promise<ListSession[]> {
    const resp = await this.send({ method: 'list' })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
    return (resp as { sessions: ListSession[] }).sessions
  }

  async getScrollback(id: string): Promise<string> {
    const resp = await this.send({ method: 'getScrollback', id })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
    return (resp as { data: string }).data
  }

  async ping(): Promise<{ uptime: number }> {
    const resp = await this.send({ method: 'ping' })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
    return { uptime: (resp as { uptime: number }).uptime }
  }

  /** Disconnect without killing daemon sessions. */
  disconnect() {
    this.intentionalDisconnect = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnecting = false
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
      this.connected = false
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  private scheduleReconnect() {
    if (this.reconnecting) return
    this.reconnecting = true
    const attempt = (delay: number) => {
      this.reconnectTimer = setTimeout(async () => {
        if (!this.reconnecting) return
        try {
          ensureDaemon()
          await this.connect()
          this.emit('reconnected')
        } catch {
          // Exponential backoff, max 10s
          attempt(Math.min(delay * 2, 10000))
        }
      }, delay)
    }
    attempt(500)
  }

  private waitForDaemon(timeoutMs: number): Promise<void> {
    const socketPath = getSocketPath()
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        // Wait for both the PID to be alive AND the socket file to exist
        if (isDaemonRunning() && existsSync(socketPath)) {
          resolve()
        } else if (Date.now() - start > timeoutMs) {
          resolve() // give up waiting, connect will fail
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }
}
