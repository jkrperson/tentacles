import type Database from 'better-sqlite3'
import type { SessionStatus } from '../../src/types'

export interface SessionRow {
  id: string
  pid: number
  cwd: string
  createdAt: number
  name: string
  agentType: string
  workspaceId: string
  hookId: string | null
  status: SessionStatus
  exitCode: number | null
  lastActivity: number
}

interface Row {
  id: string
  pid: number
  cwd: string
  created_at: number
  name: string
  agent_type: string
  workspace_id: string
  hook_id: string | null
  status: SessionStatus
  exit_code: number | null
  last_activity: number
}

function fromRow(r: Row): SessionRow {
  return {
    id: r.id, pid: r.pid, cwd: r.cwd, createdAt: r.created_at,
    name: r.name, agentType: r.agent_type, workspaceId: r.workspace_id,
    hookId: r.hook_id, status: r.status, exitCode: r.exit_code,
    lastActivity: r.last_activity,
  }
}

// All UPDATEs are silent no-ops if the row is gone — the daemon may receive
// late status events for sessions that already exited and were deleted.
export function createSessionStore(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO sessions (id, pid, cwd, created_at, name, agent_type, workspace_id, hook_id, status, exit_code, last_activity)
    VALUES (@id, @pid, @cwd, @createdAt, @name, @agentType, @workspaceId, @hookId, @status, @exitCode, @lastActivity)
  `)
  const getStmt = db.prepare<[string], Row>('SELECT * FROM sessions WHERE id = ?')
  const listStmt = db.prepare<[], Row>('SELECT * FROM sessions ORDER BY created_at ASC')
  const setStatusStmt = db.prepare(`
    UPDATE sessions SET status = @status, exit_code = @exitCode, last_activity = @now WHERE id = @id
  `)
  const setMetadataStmt = db.prepare(`
    UPDATE sessions SET name = @name, last_activity = @now WHERE id = @id
  `)
  const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?')
  const touchStmt = db.prepare('UPDATE sessions SET last_activity = @now WHERE id = @id')

  return {
    insert(row: SessionRow): void { insertStmt.run(row) },
    get(id: string): SessionRow | null {
      const r = getStmt.get(id)
      return r ? fromRow(r) : null
    },
    list(): SessionRow[] { return listStmt.all().map(fromRow) },
    setStatus(id: string, status: SessionStatus, exitCode: number | null = null): boolean {
      return setStatusStmt.run({ id, status, exitCode, now: Date.now() }).changes > 0
    },
    rename(id: string, name: string): boolean {
      return setMetadataStmt.run({ id, name, now: Date.now() }).changes > 0
    },
    touch(id: string): void { touchStmt.run({ id, now: Date.now() }) },
    delete(id: string): void { deleteStmt.run(id) },
  }
}
