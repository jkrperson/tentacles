import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { migrateSessionsJsonToDaemon } from '../jsonToSqlite'

let tmpDir: string
let sessionsPath: string
let markerPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'))
  sessionsPath = path.join(tmpDir, 'sessions.json')
  markerPath = path.join(tmpDir, '.sqlite-migrated')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const fakeClient = (opts: { connected: boolean; existing: Array<{ id: string }> } = { connected: true, existing: [] }) => ({
  isConnected: () => opts.connected,
  list: async () => opts.existing,
}) as unknown as Parameters<typeof migrateSessionsJsonToDaemon>[0]['daemonClient']

describe('migrateSessionsJsonToDaemon', () => {
  it('returns null when marker exists', async () => {
    fs.writeFileSync(markerPath, 'done')
    const result = await migrateSessionsJsonToDaemon({ sessionsPath, markerPath, daemonClient: fakeClient() })
    expect(result).toBeNull()
  })

  it('returns 0 and writes marker when no sessions.json exists', async () => {
    const result = await migrateSessionsJsonToDaemon({ sessionsPath, markerPath, daemonClient: fakeClient() })
    expect(result).toEqual({ migrated: 0 })
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('archives legacy file and strips sessions, preserves workspaces', async () => {
    const legacy = {
      sessions: [{ id: 'a', name: 'one' }, { id: 'b', name: 'two' }],
      activeSessionId: 'a',
      tabOrder: ['a', 'b'],
      workspaces: [{ id: 'w1' }],
    }
    fs.writeFileSync(sessionsPath, JSON.stringify(legacy))

    const result = await migrateSessionsJsonToDaemon({ sessionsPath, markerPath, daemonClient: fakeClient() })

    expect(result).toEqual({ migrated: 2 })
    expect(fs.existsSync(markerPath)).toBe(true)

    // Backup copy exists.
    const backups = fs.readdirSync(tmpDir).filter((f) => f.startsWith('sessions.json.legacy-'))
    expect(backups.length).toBe(1)

    // Stripped file has empty sessions but kept workspaces.
    const stripped = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    expect(stripped.sessions).toEqual([])
    expect(stripped.activeSessionId).toBeNull()
    expect(stripped.tabOrder).toEqual([])
    expect(stripped.workspaces).toEqual([{ id: 'w1' }])
  })

  it('skips migration when daemon already has sessions', async () => {
    fs.writeFileSync(sessionsPath, JSON.stringify({ sessions: [{ id: 'x' }] }))
    const result = await migrateSessionsJsonToDaemon({
      sessionsPath, markerPath,
      daemonClient: fakeClient({ connected: true, existing: [{ id: 'live' }] }),
    })
    expect(result).toEqual({ migrated: 0 })
    expect(fs.existsSync(markerPath)).toBe(true)
    // Original file untouched.
    const stillThere = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    expect(stillThere.sessions).toEqual([{ id: 'x' }])
  })

  it('returns null when daemon not connected', async () => {
    fs.writeFileSync(sessionsPath, JSON.stringify({ sessions: [] }))
    const result = await migrateSessionsJsonToDaemon({
      sessionsPath, markerPath,
      daemonClient: fakeClient({ connected: false, existing: [] }),
    })
    expect(result).toBeNull()
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('writes the marker and skips when sessions.json is malformed', async () => {
    fs.writeFileSync(sessionsPath, '{not valid json')
    const result = await migrateSessionsJsonToDaemon({ sessionsPath, markerPath, daemonClient: fakeClient() })
    expect(result).toEqual({ migrated: 0 })
    expect(fs.existsSync(markerPath)).toBe(true)
    // Original malformed file is left as-is; we don't touch it on the parse-error path.
    expect(fs.readFileSync(sessionsPath, 'utf-8')).toBe('{not valid json')
  })
})
