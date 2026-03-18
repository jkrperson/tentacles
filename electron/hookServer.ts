import express from 'express'
import type { Server } from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { ee } from './trpc/events'
import { getAdapter } from './agents/registry'
import type { AgentType } from './agents/types'

interface SessionMapping {
  ptyId: string
  agentType: AgentType
  lastEvent: unknown | null
}

const sessions = new Map<string, SessionMapping>() // hookId → mapping
let server: Server | null = null
let port = 0

const portFilePath = path.join(app.getPath('userData'), 'hook-server-port')

export function getHookPort(): number { return port }

export function registerHookSession(hookId: string, ptyId: string, agentType: AgentType) {
  sessions.set(hookId, { ptyId, agentType, lastEvent: null })
}

export function unregisterHookSession(hookId: string) {
  sessions.delete(hookId)
}

export function getLastEvent(hookId: string): unknown | null {
  return sessions.get(hookId)?.lastEvent ?? null
}

/** Read the previously used port from disk, or return 0 for auto-assign. */
function readPersistedPort(): number {
  try {
    const raw = fs.readFileSync(portFilePath, 'utf-8').trim()
    const n = parseInt(raw, 10)
    return n > 0 && n < 65536 ? n : 0
  } catch {
    return 0
  }
}

/** Persist the port to disk so future app starts reuse the same port. */
function persistPort(p: number) {
  try {
    fs.writeFileSync(portFilePath, String(p))
  } catch { /* non-critical */ }
}

function createApp(): ReturnType<typeof express> {
  const expressApp = express()
  expressApp.use(express.json())

  expressApp.post('/hook/:hookId', (req, res) => {
    const { hookId } = req.params
    const mapping = sessions.get(hookId)
    if (!mapping) {
      res.sendStatus(200) // don't block agent even if unknown
      return
    }

    const event = req.body
    mapping.lastEvent = event
    const adapter = getAdapter(mapping.agentType)

    // Emit statusDetail
    const detail = adapter.parseStatusDetail?.(event) ?? null
    ee.emit('session:statusDetail', { id: mapping.ptyId, detail })

    // Emit agentStatus (exclude 'errored' — that's only set via PTY exit)
    const status = adapter.parseStatus?.(event) ?? null
    if (status && status !== 'errored') {
      ee.emit('session:agentStatus', { id: mapping.ptyId, status: status as 'running' | 'needs_input' | 'completed' | 'idle' })
    }

    res.sendStatus(200)
  })

  return expressApp
}

/** Try to listen on a specific port. Rejects if the port is in use. */
function tryListen(expressApp: ReturnType<typeof express>, targetPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = expressApp.listen(targetPort, '127.0.0.1', () => {
      const addr = s.address()
      if (!addr || typeof addr === 'string') {
        s.close()
        reject(new Error('Failed to get server address'))
        return
      }
      server = s
      port = addr.port
      resolve(port)
    })
    s.on('error', reject)
  })
}

export async function startHookServer(): Promise<number> {
  const expressApp = createApp()

  // Try the previously persisted port first (so surviving daemon sessions' hooks still work)
  const savedPort = readPersistedPort()
  if (savedPort > 0) {
    try {
      const p = await tryListen(expressApp, savedPort)
      console.log(`[hookServer] listening on 127.0.0.1:${p} (reused)`)
      return p
    } catch {
      // Port taken — fall through to auto-assign
    }
  }

  // Auto-assign a free port
  const p = await tryListen(createApp(), 0)
  persistPort(p)
  console.log(`[hookServer] listening on 127.0.0.1:${p} (new)`)
  return p
}

export function stopHookServer() {
  server?.close()
  server = null
  sessions.clear()
}
