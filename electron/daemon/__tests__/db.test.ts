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
    expect(currentSchemaVersion(db)).toBe(1)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").all()
    expect(tables.length).toBe(1)
  })

  it('is idempotent — opening twice yields the same schema version', () => {
    const dbPath = path.join(tmpDir, 'state.db')
    const db1 = openDb(dbPath)
    expect(currentSchemaVersion(db1)).toBe(1)
    closeDb()

    const db2 = openDb(dbPath)
    expect(currentSchemaVersion(db2)).toBe(1)
  })
})
