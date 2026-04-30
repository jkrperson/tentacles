import type Database from 'better-sqlite3'

export type WorkspaceType = 'main' | 'worktree'
export type WorkspaceStatus = 'active' | 'merged' | 'stale' | 'tearing_down'

export interface WorkspaceRow {
  id: string
  projectId: string
  type: WorkspaceType
  branch: string
  worktreePath: string | null
  linkedPr: string | null
  linkedIssue: string | null
  status: WorkspaceStatus
  name: string
  createdAt: number
  sortOrder: number
}

interface Row {
  id: string
  project_id: string
  type: WorkspaceType
  branch: string
  worktree_path: string | null
  linked_pr: string | null
  linked_issue: string | null
  status: WorkspaceStatus
  name: string
  created_at: number
  sort_order: number
}

function fromRow(r: Row): WorkspaceRow {
  return {
    id: r.id, projectId: r.project_id, type: r.type,
    branch: r.branch, worktreePath: r.worktree_path,
    linkedPr: r.linked_pr, linkedIssue: r.linked_issue,
    status: r.status, name: r.name,
    createdAt: r.created_at, sortOrder: r.sort_order,
  }
}

export interface WorkspaceUpdate {
  branch?: string
  worktreePath?: string | null
  linkedPr?: string | null
  linkedIssue?: string | null
  status?: WorkspaceStatus
  name?: string
}

// All UPDATEs are silent no-ops if the row is gone. Cascading delete from
// projects is enforced via FK ON DELETE CASCADE in the schema.
export function createWorkspaceStore(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO workspaces (id, project_id, type, branch, worktree_path, linked_pr, linked_issue, status, name, created_at, sort_order)
    VALUES (@id, @projectId, @type, @branch, @worktreePath, @linkedPr, @linkedIssue, @status, @name, @createdAt, @sortOrder)
  `)
  const insertIfMissingStmt = db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, project_id, type, branch, worktree_path, linked_pr, linked_issue, status, name, created_at, sort_order)
    VALUES (@id, @projectId, @type, @branch, @worktreePath, @linkedPr, @linkedIssue, @status, @name, @createdAt, @sortOrder)
  `)
  const getStmt = db.prepare<[string], Row>('SELECT * FROM workspaces WHERE id = ?')
  const listAllStmt = db.prepare<[], Row>('SELECT * FROM workspaces ORDER BY project_id, sort_order ASC')
  const listByProjectStmt = db.prepare<[string], Row>(
    'SELECT * FROM workspaces WHERE project_id = ? ORDER BY sort_order ASC',
  )
  const deleteStmt = db.prepare('DELETE FROM workspaces WHERE id = ?')
  const reorderStmt = db.prepare(
    'UPDATE workspaces SET sort_order = @sortOrder WHERE id = @id AND project_id = @projectId',
  )

  function buildUpdate(patch: WorkspaceUpdate): { sql: string; params: Record<string, unknown> } {
    const sets: string[] = []
    const params: Record<string, unknown> = {}
    if (patch.branch !== undefined) { sets.push('branch = @branch'); params.branch = patch.branch }
    if (patch.worktreePath !== undefined) { sets.push('worktree_path = @worktreePath'); params.worktreePath = patch.worktreePath }
    if (patch.linkedPr !== undefined) { sets.push('linked_pr = @linkedPr'); params.linkedPr = patch.linkedPr }
    if (patch.linkedIssue !== undefined) { sets.push('linked_issue = @linkedIssue'); params.linkedIssue = patch.linkedIssue }
    if (patch.status !== undefined) { sets.push('status = @status'); params.status = patch.status }
    if (patch.name !== undefined) { sets.push('name = @name'); params.name = patch.name }
    return { sql: `UPDATE workspaces SET ${sets.join(', ')} WHERE id = @id`, params }
  }

  const reorderTx = db.transaction((projectId: string, idsInOrder: string[]) => {
    for (let i = 0; i < idsInOrder.length; i++) {
      reorderStmt.run({ id: idsInOrder[i], projectId, sortOrder: i })
    }
  })

  return {
    insert(row: WorkspaceRow): void { insertStmt.run(row) },
    insertIfMissing(row: WorkspaceRow): boolean {
      return insertIfMissingStmt.run(row).changes > 0
    },
    get(id: string): WorkspaceRow | null {
      const r = getStmt.get(id)
      return r ? fromRow(r) : null
    },
    listAll(): WorkspaceRow[] { return listAllStmt.all().map(fromRow) },
    listByProject(projectId: string): WorkspaceRow[] {
      return listByProjectStmt.all(projectId).map(fromRow)
    },
    update(id: string, patch: WorkspaceUpdate): boolean {
      if (Object.keys(patch).length === 0) return false
      const { sql, params } = buildUpdate(patch)
      return db.prepare(sql).run({ ...params, id }).changes > 0
    },
    reorder(projectId: string, idsInOrder: string[]): void { reorderTx(projectId, idsInOrder) },
    delete(id: string): boolean { return deleteStmt.run(id).changes > 0 },
  }
}
