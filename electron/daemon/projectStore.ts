import type Database from 'better-sqlite3'

export interface ProjectRow {
  id: string
  path: string
  name: string
  color: string
  icon: string | null
  addedAt: number
  sortOrder: number
}

interface Row {
  id: string
  path: string
  name: string
  color: string
  icon: string | null
  added_at: number
  sort_order: number
}

function fromRow(r: Row): ProjectRow {
  return {
    id: r.id, path: r.path, name: r.name,
    color: r.color, icon: r.icon,
    addedAt: r.added_at, sortOrder: r.sort_order,
  }
}

export interface ProjectUpdate {
  name?: string
  color?: string
  icon?: string | null
}

// All UPDATEs are silent no-ops if the row is gone.
export function createProjectStore(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO projects (id, path, name, color, icon, added_at, sort_order)
    VALUES (@id, @path, @name, @color, @icon, @addedAt, @sortOrder)
  `)
  const getStmt = db.prepare<[string], Row>('SELECT * FROM projects WHERE id = ?')
  const listStmt = db.prepare<[], Row>('SELECT * FROM projects ORDER BY sort_order ASC')
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?')
  const reorderStmt = db.prepare('UPDATE projects SET sort_order = @sortOrder WHERE id = @id')

  function buildUpdate(patch: ProjectUpdate): { sql: string; params: Record<string, unknown> } {
    const sets: string[] = []
    const params: Record<string, unknown> = {}
    if (patch.name !== undefined) { sets.push('name = @name'); params.name = patch.name }
    if (patch.color !== undefined) { sets.push('color = @color'); params.color = patch.color }
    if (patch.icon !== undefined) { sets.push('icon = @icon'); params.icon = patch.icon }
    return { sql: `UPDATE projects SET ${sets.join(', ')} WHERE id = @id`, params }
  }

  const reorderTx = db.transaction((idsInOrder: string[]) => {
    for (let i = 0; i < idsInOrder.length; i++) {
      reorderStmt.run({ id: idsInOrder[i], sortOrder: i })
    }
  })

  return {
    insert(row: ProjectRow): void { insertStmt.run(row) },
    get(id: string): ProjectRow | null {
      const r = getStmt.get(id)
      return r ? fromRow(r) : null
    },
    list(): ProjectRow[] { return listStmt.all().map(fromRow) },
    update(id: string, patch: ProjectUpdate): boolean {
      const setKeys = Object.keys(patch)
      if (setKeys.length === 0) return false
      const { sql, params } = buildUpdate(patch)
      return db.prepare(sql).run({ ...params, id }).changes > 0
    },
    reorder(idsInOrder: string[]): void { reorderTx(idsInOrder) },
    delete(id: string): boolean { return deleteStmt.run(id).changes > 0 },
  }
}
