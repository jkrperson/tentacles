import { createRequire } from 'node:module'
import { spawn, execSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { encodeMessage, LspMessageParser } from './lspBridge'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')

interface LspConfig {
  command: string
  args: string[]
  fileExtensions: string[]
}

const LSP_CONFIGS: Record<string, LspConfig> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  python: {
    command: 'pylsp',
    args: [],
    fileExtensions: ['.py'],
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
    fileExtensions: ['.rs'],
  },
  go: {
    command: 'gopls',
    args: ['serve'],
    fileExtensions: ['.go'],
  },
}

interface LspServer {
  process: ChildProcess
  wss: InstanceType<typeof WebSocket.Server>
  port: number
  languageId: string
  projectRoot: string
}

function serverKey(languageId: string, projectRoot: string): string {
  return `${languageId}:${projectRoot}`
}

export class LspManager {
  private servers = new Map<string, LspServer>()

  async start(languageId: string, projectRoot: string): Promise<{ port: number }> {
    const key = serverKey(languageId, projectRoot)
    const existing = this.servers.get(key)
    if (existing) {
      return { port: existing.port }
    }

    const config = LSP_CONFIGS[languageId]
    if (!config) {
      throw new Error(`No LSP config for language: ${languageId}`)
    }

    // Spawn the language server
    const lsProcess = spawn(config.command, config.args, {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    // Create a WebSocket server on a random port, bound to localhost only
    const wss = new WebSocket.Server({ host: '127.0.0.1', port: 0 })
    const port: number = await new Promise((resolve) => {
      wss.on('listening', () => {
        resolve(wss.address().port)
      })
    })

    const parser = new LspMessageParser((json: string) => {
      // Forward parsed LSP messages from server stdout to all connected WS clients
      wss.clients.forEach((client: InstanceType<typeof WebSocket>) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(json)
        }
      })
    })

    // Bridge: server stdout -> parser -> WebSocket clients
    lsProcess.stdout?.on('data', (chunk: Buffer) => {
      parser.write(chunk)
    })

    lsProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[LSP ${languageId}] stderr:`, chunk.toString())
    })

    // Bridge: WebSocket messages -> Content-Length framed stdin
    wss.on('connection', (ws: InstanceType<typeof WebSocket>) => {
      ws.on('message', (data: Buffer | string) => {
        const json = typeof data === 'string' ? data : data.toString('utf-8')
        if (lsProcess.stdin?.writable) {
          lsProcess.stdin.write(encodeMessage(json))
        }
      })
    })

    // Clean up on process exit
    lsProcess.on('exit', (code) => {
      console.log(`[LSP ${languageId}] exited with code ${code}`)
      wss.close()
      this.servers.delete(key)
    })

    lsProcess.on('error', (err) => {
      console.error(`[LSP ${languageId}] failed to spawn:`, err.message)
      wss.close()
      this.servers.delete(key)
    })

    const server: LspServer = { process: lsProcess, wss, port, languageId, projectRoot }
    this.servers.set(key, server)

    return { port }
  }

  private closeServer(server: LspServer): void {
    // Close all connected WebSocket clients first to release their FDs
    try {
      server.wss.clients.forEach((client: InstanceType<typeof WebSocket>) => {
        try { client.terminate() } catch { /* ignore */ }
      })
    } catch { /* ignore */ }
    try { server.process.kill() } catch { /* already dead */ }
    try { server.wss.close() } catch { /* already closed */ }
  }

  stop(languageId: string, projectRoot: string): void {
    const key = serverKey(languageId, projectRoot)
    const server = this.servers.get(key)
    if (!server) return

    this.closeServer(server)
    this.servers.delete(key)
  }

  stopAll(): void {
    for (const [key, server] of this.servers) {
      this.closeServer(server)
      this.servers.delete(key)
    }
  }

  status(languageId: string, projectRoot: string): { running: boolean; port: number | null } {
    const key = serverKey(languageId, projectRoot)
    const server = this.servers.get(key)
    if (!server) return { running: false, port: null }
    return { running: true, port: server.port }
  }

  /** Probe PATH for each configured language server binary. */
  listAvailable(): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    const which = process.platform === 'win32' ? 'where' : 'which'
    for (const [lang, config] of Object.entries(LSP_CONFIGS)) {
      try {
        execSync(`${which} ${config.command}`, { stdio: 'ignore' })
        result[lang] = true
      } catch {
        result[lang] = false
      }
    }
    return result
  }
}
