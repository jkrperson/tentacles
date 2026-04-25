import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: Database.Database | null = null

const MIGRATIONS = [
  // Index 0 → applies on transition from user_version 0 → 1
  { version: 1, file: '001_sessions.sql' },
] as const

export function openDb(dbPath: string): Database.Database {
  if (db) return db

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyMigrations(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function currentSchemaVersion(d: Database.Database): number {
  return (d.pragma('user_version', { simple: true }) as number) ?? 0
}

function applyMigrations(d: Database.Database): void {
  const migrationsDir = path.join(__dirname, 'migrations')
  let version = currentSchemaVersion(d)

  for (const m of MIGRATIONS) {
    if (version >= m.version) continue
    const sql = fs.readFileSync(path.join(migrationsDir, m.file), 'utf-8')
    d.exec('BEGIN')
    try {
      d.exec(sql)
      d.pragma(`user_version = ${m.version}`)
      d.exec('COMMIT')
      version = m.version
    } catch (err) {
      d.exec('ROLLBACK')
      throw err
    }
  }
}
