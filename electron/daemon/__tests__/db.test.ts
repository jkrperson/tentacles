import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { openDb, closeDb, currentSchemaVersion } from '../db'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tentacles-db-test-'))
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('daemon db', () => {
  it('creates the schema on first open and reports the latest version', () => {
    const db = openDb(path.join(tmpDir, 'state.db'))
    expect(currentSchemaVersion(db)).toBe(2)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").all()
    expect(tables.length).toBe(1)
  })

  it('is idempotent — opening twice yields the same schema version', () => {
    const dbPath = path.join(tmpDir, 'state.db')
    const db1 = openDb(dbPath)
    expect(currentSchemaVersion(db1)).toBe(2)
    closeDb()

    const db2 = openDb(dbPath)
    expect(currentSchemaVersion(db2)).toBe(2)
  })

  it('throws when reopened with a different path before closing', () => {
    openDb(path.join(tmpDir, 'a.db'))
    expect(() => openDb(path.join(tmpDir, 'b.db'))).toThrow(/different path/)
  })

  it('applies v2 migration with projects and workspaces tables', () => {
    const db = openDb(path.join(tmpDir, 'state.db'))
    expect(currentSchemaVersion(db)).toBe(2)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects','workspaces')",
    ).all() as { name: string }[]
    expect(tables.map((t) => t.name).sort()).toEqual(['projects', 'workspaces'])
  })

  it('enforces ON DELETE CASCADE from projects to workspaces', () => {
    const db = openDb(path.join(tmpDir, 'state.db'))
    db.prepare(
      "INSERT INTO projects (id, path, name, color, sort_order, added_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('/repo', '/repo', 'repo', '#5B6B95', 0, 1700000000000)
    db.prepare(
      "INSERT INTO workspaces (id, project_id, type, branch, status, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run('main:/repo', '/repo', 'main', '', 'active', 'main', 1700000000000)

    db.prepare("DELETE FROM projects WHERE id = ?").run('/repo')

    const remaining = db.prepare("SELECT COUNT(*) as c FROM workspaces").get() as { c: number }
    expect(remaining.c).toBe(0)
  })
})
