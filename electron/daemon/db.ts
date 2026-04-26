import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import sql001 from './migrations/001_sessions.sql'
import sql002 from './migrations/002_projects_workspaces.sql'

let db: Database.Database | null = null
let openedPath: string | null = null

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  // Index 0 → applies on transition from user_version 0 → 1
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
]

export function openDb(dbPath: string): Database.Database {
  if (db) {
    if (openedPath !== dbPath) {
      throw new Error(
        `openDb called with a different path. Already open at ${openedPath}, requested ${dbPath}. ` +
        `Call closeDb() first.`,
      )
    }
    return db
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  openedPath = dbPath
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyMigrations(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    openedPath = null
  }
}

export function currentSchemaVersion(d: Database.Database): number {
  return (d.pragma('user_version', { simple: true }) as number) ?? 0
}

function applyMigrations(d: Database.Database): void {
  // MIGRATIONS must be strictly ascending and contiguous starting at 1.
  // A duplicate or out-of-order entry would silently skip migrations,
  // corrupting schema state — fail loudly at startup instead.
  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (MIGRATIONS[i].version !== i + 1) {
      throw new Error(
        `MIGRATIONS list is malformed: entry ${i} has version ${MIGRATIONS[i].version}, expected ${i + 1}`,
      )
    }
  }

  let version = currentSchemaVersion(d)

  for (const m of MIGRATIONS) {
    if (version >= m.version) continue
    d.exec('BEGIN')
    try {
      d.exec(m.sql)
      d.pragma(`user_version = ${m.version}`)
      d.exec('COMMIT')
      version = m.version
    } catch (err) {
      d.exec('ROLLBACK')
      throw err
    }
  }
}
