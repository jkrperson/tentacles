import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

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
  private ptys = new Map<string, ManagedPty>()
  private onDataCb: DataCallback | null = null
  private onExitCb: ExitCallback | null = null
  private onTitleCb: DataCallback | null = null
  private onShellDataCb: DataCallback | null = null
  private onShellExitCb: ExitCallback | null = null
  private lastTitles = new Map<string, string>()

  // Data coalescing — buffers rapid PTY output and flushes once per tick
  private dataBuffers = new Map<string, string>()
  private flushScheduled = new Set<string>()

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

  create(name: string, cwd: string, claudeCliPath = 'claude', extraArgs: string[] = []): { id: string; pid: number } {
    const safeCwd = existsSync(cwd) ? cwd : homedir()
    return this._spawn(name, safeCwd, claudeCliPath, extraArgs, 'agent')
  }

  createShell(name: string, cwd: string): { id: string; pid: number } {
    const shell = resolveShell()
    const safeCwd = existsSync(cwd) ? cwd : homedir()
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

  private _spawn(name: string, cwd: string, command: string, args: string[], kind: PtyKind): { id: string; pid: number } {
    const id = randomUUID()

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    })

    const managed: ManagedPty = { id, name, cwd, pid: ptyProcess.pid, kind, ptyProcess }
    this.ptys.set(id, managed)

    ptyProcess.onData((data: string) => {
      if (kind === 'shell') {
        this.emitData(id, data, this.onShellDataCb)
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
    this.ptys.get(id)?.ptyProcess.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.ptys.get(id)?.ptyProcess.resize(cols, rows)
    } catch {
      // ignore resize errors for dead processes
    }
  }

  kill(id: string) {
    const managed = this.ptys.get(id)
    if (managed) {
      managed.ptyProcess.kill()
      this.ptys.delete(id)
    }
  }

  list() {
    return Array.from(this.ptys.values()).map(({ id, pid, name, cwd }) => ({ id, pid, name, cwd }))
  }

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
