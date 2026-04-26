import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { openDb, closeDb } from '../db'
import { createProjectStore, ProjectRow } from '../projectStore'

let tmpDir: string
let store: ReturnType<typeof createProjectStore>

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'))
  const db = openDb(path.join(tmpDir, 'state.db'))
  store = createProjectStore(db)
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const sample = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id: '/repo', path: '/repo', name: 'repo',
  color: '#5B6B95', icon: null, addedAt: 1700000000000, sortOrder: 0,
  ...overrides,
})

describe('projectStore', () => {
  it('insert + get round-trips all fields', () => {
    store.insert(sample({ icon: 'OCT' }))
    expect(store.get('/repo')).toEqual(sample({ icon: 'OCT' }))
  })

  it('list returns projects ordered by sort_order ascending', () => {
    store.insert(sample({ id: 'a', path: '/a', sortOrder: 2 }))
    store.insert(sample({ id: 'b', path: '/b', sortOrder: 1 }))
    expect(store.list().map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('update only mutates provided fields', () => {
    store.insert(sample())
    store.update('/repo', { color: '#9A5E67', icon: 'R' })
    const row = store.get('/repo')!
    expect(row.color).toBe('#9A5E67')
    expect(row.icon).toBe('R')
    expect(row.name).toBe('repo')
  })

  it('reorder updates sort_order across multiple rows in one transaction', () => {
    store.insert(sample({ id: 'a', path: '/a', sortOrder: 0 }))
    store.insert(sample({ id: 'b', path: '/b', sortOrder: 1 }))
    store.insert(sample({ id: 'c', path: '/c', sortOrder: 2 }))
    store.reorder(['c', 'a', 'b'])
    expect(store.list().map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('delete removes the row', () => {
    store.insert(sample())
    store.delete('/repo')
    expect(store.get('/repo')).toBeNull()
  })
})
