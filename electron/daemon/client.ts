// Typed client for communicating with the terminal daemon from Electron main process.

import * as net from 'node:net'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getSocketPath, ensureDaemon, isDaemonPidAlive, getDaemonPid, launchDaemon } from './launcher'
import type {
  DaemonRequest,
  DaemonResponse,
  DaemonEvent,
  TaggedRequest,
  ListSession,
  SessionMetadata,
} from './protocol'
import {
  DAEMON_REQUIRED_CAPABILITIES as REQUIRED_CAPABILITIES,
  DAEMON_PROTOCOL_VERSION as CLIENT_PROTOCOL_VERSION,
} from './protocol'
import type { SessionStatus } from '../../src/types'

type PendingResolve = (response: DaemonResponse) => void

export class DaemonClient extends EventEmitter {
  private socket: net.Socket | null = null
  private pending = new Map<string, PendingResolve>()
  private buffer = ''
  private connected = false
  private reconnecting = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalDisconnect = false
  private pendingCompatibilityRestartReason: string | null = null

  /** Ensure the daemon is running and connect to it. */
  async ensureAndConnect(): Promise<void> {
    const launched = ensureDaemon()
    // If we just spawned the daemon, wait for its socket to appear
    if (launched) {
      await this.waitForDaemon(5000)
    }
    await this.connect()

    // Verify the daemon is healthy with a ping, compatibility check, and a test spawn.
    let healthy = false
    try {
      const ping = await this.ping()
      const compatibility = this.checkCompatibility(ping)
      if (!compatibility.ok) {
        const deferred = await this.deferCompatibilityRestartIfSessionsAlive(compatibility.reason)
        if (deferred) {
          healthy = true
        } else {
          console.log(`[daemon] Connected but incompatible (${compatibility.reason}) - restarting daemon`)
        }
      } else {
        // Verify spawning works - a stale daemon may respond to pings but fail to spawn.
        await this.spawnTest()
        this.pendingCompatibilityRestartReason = null
        healthy = true
      }
    } catch {
      console.log('[daemon] Connected but health check failed - restarting daemon')
    }

    if (!healthy) {
      await this.restartDaemonProcess()
      this.pendingCompatibilityRestartReason = null
    }
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

  async spawn(
    id: string,
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    metadata: SessionMetadata,
    cols = 120,
    rows = 30,
  ): Promise<{ pid: number }> {
    const resp = await this.send({ method: 'spawn', id, command, args, cwd, env, cols, rows, metadata })
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

  async setSessionStatus(id: string, status: SessionStatus, exitCode: number | null = null): Promise<void> {
    const resp = await this.send({ method: 'setSessionStatus', id, status, exitCode })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
  }

  async renameSession(id: string, name: string): Promise<void> {
    const resp = await this.send({ method: 'renameSession', id, name })
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

  async ping(): Promise<{ uptime: number; protocolVersion?: string; capabilities?: string[] }> {
    const resp = await this.send({ method: 'ping' })
    if (!resp.ok) throw new Error((resp as { error: string }).error)
    const pingResp = resp as { uptime: number; protocolVersion?: string; capabilities?: string[] }
    return {
      uptime: pingResp.uptime,
      protocolVersion: pingResp.protocolVersion,
      capabilities: pingResp.capabilities,
    }
  }

  hasPendingCompatibilityRestart(): boolean {
    return this.pendingCompatibilityRestartReason !== null
  }

  async migrateToCompatibleDaemon(): Promise<boolean> {
    if (!this.pendingCompatibilityRestartReason) return false

    await this.restartDaemonProcess()
    try {
      const ping = await this.ping()
      const compatibility = this.checkCompatibility(ping)
      if (!compatibility.ok) {
        this.pendingCompatibilityRestartReason = compatibility.reason
        return false
      }
      await this.spawnTest()
      this.pendingCompatibilityRestartReason = null
      this.emit('compatibilityMigrated')
      return true
    } catch {
      return false
    }
  }

  private checkCompatibility(
    ping: { protocolVersion?: string; capabilities?: string[] },
  ): { ok: true } | { ok: false; reason: string } {
    // Legacy daemon with no advertised capabilities: assume compatible to avoid
    // killing active sessions during upgrades.
    if (!Array.isArray(ping.capabilities) || ping.capabilities.length === 0) {
      return { ok: true }
    }

    const capabilities = ping.capabilities
    const missing = REQUIRED_CAPABILITIES.filter((cap) => !capabilities.includes(cap))
    if (missing.length > 0) {
      return { ok: false, reason: `missing capabilities: ${missing.join(', ')}` }
    }

    // Informative only; capability checks are the compatibility gate.
    if (ping.protocolVersion && ping.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
      console.log(
        `[daemon] Protocol version differs (daemon=${ping.protocolVersion}, client=${CLIENT_PROTOCOL_VERSION}); continuing due to compatible capabilities`,
      )
    }

    return { ok: true }
  }

  private async deferCompatibilityRestartIfSessionsAlive(reason: string): Promise<boolean> {
    try {
      const sessions = await this.list()
      if (sessions.length === 0) return false

      this.pendingCompatibilityRestartReason = reason
      this.emit('compatibilityDeferred', { reason, sessionCount: sessions.length })
      console.log(`[daemon] Incompatible daemon restart deferred (${sessions.length} active session${sessions.length === 1 ? '' : 's'})`)
      return true
    } catch {
      return false
    }
  }

  private async restartDaemonProcess(): Promise<void> {
    this.disconnect()
    this.intentionalDisconnect = false

    const pid = getDaemonPid()
    if (pid) {
      try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
    }

    launchDaemon()
    await this.waitForDaemon(5000)
    await this.connect()
  }

  /** Spawn a short-lived process to verify the daemon can actually create PTYs. */
  async spawnTest(): Promise<void> {
    const testId = `health-check-${Date.now()}`
    const metadata: SessionMetadata = {
      name: 'health-check',
      agentType: 'system',
      workspaceId: 'system',
      hookId: null,
    }
    // Race spawn against a 3s timeout — if the daemon can't spawn, fail fast
    const result = await Promise.race([
      this.spawn(testId, '/bin/true', [], process.env.HOME || '/tmp', {}, metadata),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Spawn health check timed out')), 3000)
      ),
    ])
    if (!result.pid) throw new Error('Spawn test returned no PID')
    // Clean up the test session
    await this.kill(testId).catch(() => {})
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
        // Wait for both the PID to be alive AND the socket file to exist.
        // Use the non-destructive isDaemonPidAlive() check — isDaemonRunning()
        // would kill a freshly launched daemon whose socket doesn't exist yet.
        if (isDaemonPidAlive() && existsSync(socketPath)) {
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
