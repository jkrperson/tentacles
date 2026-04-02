import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { DaemonClient } from './daemon/client'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

type PtyKind = 'agent' | 'shell'

interface PtyProcess {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  onExit(callback: (e: { exitCode: number }) => void): void
}

interface ManagedPty {
  id: string
  name: string
  cwd: string
  pid: number
  kind: PtyKind
  ptyProcess: PtyProcess
}

type DataCallback = (id: string, data: string) => void
type ExitCallback = (id: string, exitCode: number) => void

// OSC 0 or 2: ESC] (0|2) ; <title> (BEL | ESC\)
// eslint-disable-next-line no-control-regex
const OSC_TITLE_RE = /\u001b\](?:0|2);([^\u0007\u001b]*?)(?:\u0007|\u001b\\)/
// Normalize braille spinner chars (U+2800–U+28FF) to a single char for dedup
const BRAILLE_RE = /[\u2800-\u28FF]/g

/** Resolve a usable shell binary, preferring $SHELL but falling back to known paths. */
function resolveShell(): string {
  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ]
  for (const sh of candidates) {
    if (sh && existsSync(sh)) return sh
  }
  // Last resort — let the OS search PATH
  return '/bin/sh'
}

export class PtyManager {
  // Local PTYs (shell terminals only — agent sessions are daemon-managed)
  private ptys = new Map<string, ManagedPty>()
  private onDataCb: DataCallback | null = null
  private onExitCb: ExitCallback | null = null
  private onTitleCb: DataCallback | null = null
  private onShellDataCb: DataCallback | null = null
  private onShellExitCb: ExitCallback | null = null
  private onShellTitleCb: DataCallback | null = null
  private lastTitles = new Map<string, string>()

  // Data coalescing for local PTYs
  private dataBuffers = new Map<string, string>()
  private flushScheduled = new Set<string>()

  // Daemon client for agent sessions
  private daemonClient: DaemonClient | null = null
  // Track daemon-managed session IDs for routing
  private daemonSessions = new Set<string>()

  setDaemonClient(client: DaemonClient) {
    this.daemonClient = client

    // Wire daemon events to callbacks
    client.on('data', (event: { id: string; data: string }) => {
      if (!this.daemonSessions.has(event.id)) return
      this.onDataCb?.(event.id, event.data)

      // Parse OSC title sequences from agent output
      const match = event.data.match(OSC_TITLE_RE)
      if (match) {
        const title = match[1]
        const normalized = title.replace(BRAILLE_RE, '\u2800')
        if (title && normalized !== this.lastTitles.get(event.id)) {
          this.lastTitles.set(event.id, normalized)
          this.onTitleCb?.(event.id, title)
        }
      }
    })

    client.on('exit', (event: { id: string; exitCode: number }) => {
      if (!this.daemonSessions.has(event.id)) return
      this.daemonSessions.delete(event.id)
      this.lastTitles.delete(event.id)
      this.onExitCb?.(event.id, event.exitCode)
    })
  }

  onData(cb: DataCallback) {
    this.onDataCb = cb
  }

  onExit(cb: ExitCallback) {
    this.onExitCb = cb
  }

  onTitle(cb: DataCallback) {
    this.onTitleCb = cb
  }

  onShellData(cb: DataCallback) {
    this.onShellDataCb = cb
  }

  onShellExit(cb: ExitCallback) {
    this.onShellExitCb = cb
  }

  onShellTitle(cb: DataCallback) {
    this.onShellTitleCb = cb
  }

  /** Create an agent session via the daemon. */
  async create(name: string, cwd: string, command = 'claude', args: string[] = [], env?: Record<string, string>): Promise<{ id: string; pid: number }> {
    const safeCwd = existsSync(cwd) ? cwd : homedir()

    if (this.daemonClient?.isConnected()) {
      const id = randomUUID()
      try {
        const { pid } = await this.daemonClient.spawn(id, command, args, safeCwd, env ?? {})
        this.daemonSessions.add(id)
        console.log(`[ptyManager] daemon spawn ok id="${id}" pid=${pid}`)
        return { id, pid }
      } catch (err) {
        console.error(`[ptyManager] daemon spawn FAILED command="${command}" args=${JSON.stringify(args)} cwd="${safeCwd}"`, err)
        throw err
      }
    }

    console.log(`[ptyManager] daemon not connected, falling back to local spawn command="${command}"`)
    // Fallback to local spawn if daemon is not connected
    return this._spawn(name, safeCwd, command, args, 'agent', env)
  }

  /** Register an existing daemon session (for reattach after app restart). */
  registerDaemonSession(id: string) {
    this.daemonSessions.add(id)
  }

  createShell(name: string, cwd: string): { id: string; pid: number } {
    const safeCwd = existsSync(cwd) ? cwd : homedir()
    const shell = resolveShell()
    return this._spawn(name, safeCwd, shell, ['--login'], 'shell')
  }

  /** Buffer data for an id and schedule a flush via setImmediate.
   *  Coalesces bursts of small PTY chunks into fewer, larger IPC sends. */
  private emitData(id: string, data: string, cb: DataCallback | null) {
    if (!cb) return
    const prev = this.dataBuffers.get(id)
    this.dataBuffers.set(id, prev ? prev + data : data)

    if (!this.flushScheduled.has(id)) {
      this.flushScheduled.add(id)
      setImmediate(() => {
        this.flushScheduled.delete(id)
        const buffered = this.dataBuffers.get(id)
        if (buffered) {
          this.dataBuffers.delete(id)
          cb(id, buffered)
        }
      })
    }
  }

  private _spawn(name: string, cwd: string, command: string, args: string[], kind: PtyKind, extraEnv?: Record<string, string>): { id: string; pid: number } {
    const id = randomUUID()

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        LANG: process.env.LANG || 'en_US.UTF-8',
        ...extraEnv,
      },
    })

    const managed: ManagedPty = { id, name, cwd, pid: ptyProcess.pid, kind, ptyProcess }
    this.ptys.set(id, managed)

    ptyProcess.onData((data: string) => {
      if (kind === 'shell') {
        this.emitData(id, data, this.onShellDataCb)
        // Parse OSC title sequences from shell output (process name, cwd, etc.)
        const match = data.match(OSC_TITLE_RE)
        if (match) {
          const title = match[1]
          if (title && title !== this.lastTitles.get(id)) {
            this.lastTitles.set(id, title)
            this.onShellTitleCb?.(id, title)
          }
        }
      } else {
        this.emitData(id, data, this.onDataCb)
        // Parse OSC title sequences from agent output (per-chunk for responsiveness)
        const match = data.match(OSC_TITLE_RE)
        if (match) {
          const title = match[1]
          // Normalize spinner frames so "⠋ Task" and "⠙ Task" dedup to the same key
          const normalized = title.replace(BRAILLE_RE, '\u2800')
          if (title && normalized !== this.lastTitles.get(id)) {
            this.lastTitles.set(id, normalized)
            this.onTitleCb?.(id, title)
          }
        }
      }
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (kind === 'shell') {
        this.onShellExitCb?.(id, exitCode)
      } else {
        this.onExitCb?.(id, exitCode)
      }
      this.ptys.delete(id)
      this.lastTitles.delete(id)
      this.dataBuffers.delete(id)
      this.flushScheduled.delete(id)
    })

    return { id, pid: ptyProcess.pid }
  }

  write(id: string, data: string) {
    // Route to daemon or local
    if (this.daemonSessions.has(id)) {
      this.daemonClient?.write(id, data).catch(() => {})
      return
    }
    this.ptys.get(id)?.ptyProcess.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    if (this.daemonSessions.has(id)) {
      this.daemonClient?.resize(id, cols, rows).catch(() => {})
      return
    }
    try {
      this.ptys.get(id)?.ptyProcess.resize(cols, rows)
    } catch {
      // ignore resize errors for dead processes
    }
  }

  kill(id: string) {
    if (this.daemonSessions.has(id)) {
      this.daemonClient?.kill(id).catch(() => {})
      this.daemonSessions.delete(id)
      return
    }
    const managed = this.ptys.get(id)
    if (managed) {
      const pid = managed.pid
      managed.ptyProcess.kill()
      // Don't delete from map here — let the onExit callback handle cleanup.
      // If the process doesn't exit within 5s, force-kill to prevent zombie FD leaks.
      setTimeout(() => {
        if (this.ptys.has(id)) {
          try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
          this.ptys.delete(id)
          this.lastTitles.delete(id)
          this.dataBuffers.delete(id)
          this.flushScheduled.delete(id)
        }
      }, 5000)
    }
  }

  list() {
    return Array.from(this.ptys.values()).map(({ id, pid, name, cwd }) => ({ id, pid, name, cwd }))
  }

  /** Check if there are any active agent or shell sessions. */
  hasActiveSessions(): boolean {
    return this.daemonSessions.size > 0 || this.ptys.size > 0
  }

  /** Kill only local PTYs (shells). Daemon sessions are left alive. */
  killAll() {
    for (const [id, managed] of this.ptys) {
      try {
        managed.ptyProcess.kill()
      } catch {
        // ignore
      }
      this.ptys.delete(id)
    }
  }
}
