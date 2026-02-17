import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

type PtyKind = 'agent' | 'shell'

interface ManagedPty {
  id: string
  name: string
  cwd: string
  pid: number
  kind: PtyKind
  ptyProcess: any
}

type DataCallback = (id: string, data: string) => void
type ExitCallback = (id: string, exitCode: number) => void

// OSC 0 or 2: \x1b] (0|2) ; <title> (\x07 | \x1b\\)
const OSC_TITLE_RE = /\x1b\](?:0|2);([^\x07\x1b]*?)(?:\x07|\x1b\\)/
// Normalize braille spinner chars (U+2800–U+28FF) to a single char for dedup
const BRAILLE_RE = /[\u2800-\u28FF]/g

export class PtyManager {
  private ptys = new Map<string, ManagedPty>()
  private onDataCb: DataCallback | null = null
  private onExitCb: ExitCallback | null = null
  private onTitleCb: DataCallback | null = null
  private onShellDataCb: DataCallback | null = null
  private onShellExitCb: ExitCallback | null = null
  private lastTitles = new Map<string, string>()

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
    return this._spawn(name, cwd, claudeCliPath, extraArgs, 'agent')
  }

  createShell(name: string, cwd: string): { id: string; pid: number } {
    const userShell = process.env.SHELL || '/bin/zsh'
    return this._spawn(name, cwd, userShell, ['--login'], 'shell')
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
        this.onShellDataCb?.(id, data)
      } else {
        this.onDataCb?.(id, data)
        // Parse OSC title sequences from agent output
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
