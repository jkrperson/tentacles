import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { openDb, closeDb } from '../db'
import { createSessionStore, SessionRow } from '../sessionStore'

let tmpDir: string
let store: ReturnType<typeof createSessionStore>

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-'))
  const db = openDb(path.join(tmpDir, 'state.db'))
  store = createSessionStore(db)
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const sample = (): SessionRow => ({
  id: 's1', pid: 1234, cwd: '/repo', createdAt: 1700000000000,
  name: 'swift-cedar', agentType: 'claude', workspaceId: 'main:/repo',
  hookId: 'h1', status: 'idle', exitCode: null, lastActivity: 1700000000000,
})

describe('sessionStore', () => {
  it('insert + get round-trips all fields', () => {
    store.insert(sample())
    expect(store.get('s1')).toEqual(sample())
  })

  it('list returns sessions sorted by createdAt ascending', () => {
    store.insert({ ...sample(), id: 'a', createdAt: 2 })
    store.insert({ ...sample(), id: 'b', createdAt: 1 })
    expect(store.list().map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('setStatus updates status and exit code atomically', () => {
    store.insert(sample())
    store.setStatus('s1', 'completed', 0)
    const row = store.get('s1')!
    expect(row.status).toBe('completed')
    expect(row.exitCode).toBe(0)
  })

  it('delete removes the row', () => {
    store.insert(sample())
    store.delete('s1')
    expect(store.get('s1')).toBeNull()
  })

  it('rejects invalid status via CHECK constraint', () => {
    expect(() => store.insert({ ...sample(), status: 'bogus' as never })).toThrow()
  })
})
