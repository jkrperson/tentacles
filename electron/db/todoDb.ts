import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

const TENTACLES_DIR = path.join(os.homedir(), '.tentacles')
const DB_PATH = path.join(TENTACLES_DIR, 'todos.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  fs.mkdirSync(TENTACLES_DIR, { recursive: true })

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES todo_projects(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog', 'todo', 'in_progress', 'done')),
      priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none', 'low', 'medium', 'high', 'urgent')),
      workspace_id TEXT,
      repo_path TEXT,
      sort_order REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    CREATE INDEX IF NOT EXISTS idx_todos_project_id ON todos(project_id);
    CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos(parent_id);
  `)

  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

// --- Todo Projects ---

export interface TodoProject {
  id: string
  name: string
  created_at: string
}

export function listTodoProjects(): TodoProject[] {
  return getDb().prepare('SELECT * FROM todo_projects ORDER BY created_at DESC').all() as TodoProject[]
}

export function createTodoProject(id: string, name: string): TodoProject {
  getDb().prepare('INSERT INTO todo_projects (id, name) VALUES (?, ?)').run(id, name)
  return getDb().prepare('SELECT * FROM todo_projects WHERE id = ?').get(id) as TodoProject
}

export function updateTodoProject(id: string, name: string): TodoProject {
  getDb().prepare('UPDATE todo_projects SET name = ? WHERE id = ?').run(name, id)
  return getDb().prepare('SELECT * FROM todo_projects WHERE id = ?').get(id) as TodoProject
}

export function deleteTodoProject(id: string): void {
  getDb().prepare('DELETE FROM todo_projects WHERE id = ?').run(id)
}

// --- Todos ---

export type TodoStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface Todo {
  id: string
  project_id: string | null
  parent_id: string | null
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  workspace_id: string | null
  repo_path: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export function listTodos(filters?: { projectId?: string; status?: TodoStatus; parentId?: string | null }): Todo[] {
  let sql = 'SELECT * FROM todos WHERE 1=1'
  const params: unknown[] = []

  if (filters?.projectId) {
    sql += ' AND project_id = ?'
    params.push(filters.projectId)
  }
  if (filters?.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.parentId !== undefined) {
    if (filters.parentId === null) {
      sql += ' AND parent_id IS NULL'
    } else {
      sql += ' AND parent_id = ?'
      params.push(filters.parentId)
    }
  }

  sql += ' ORDER BY sort_order ASC, created_at DESC'
  return getDb().prepare(sql).all(...params) as Todo[]
}

export function getTodo(id: string): Todo | undefined {
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined
}

export interface CreateTodoInput {
  id: string
  title: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  projectId?: string
  parentId?: string
  workspaceId?: string
  repoPath?: string
  sortOrder?: number
}

export function createTodo(input: CreateTodoInput): Todo {
  const stmt = getDb().prepare(`
    INSERT INTO todos (id, title, description, status, priority, project_id, parent_id, workspace_id, repo_path, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    input.id,
    input.title,
    input.description ?? null,
    input.status ?? 'backlog',
    input.priority ?? 'none',
    input.projectId ?? null,
    input.parentId ?? null,
    input.workspaceId ?? null,
    input.repoPath ?? null,
    input.sortOrder ?? 0,
  )
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(input.id) as Todo
}

export interface UpdateTodoInput {
  id: string
  title?: string
  description?: string | null
  status?: TodoStatus
  priority?: TodoPriority
  projectId?: string | null
  parentId?: string | null
  workspaceId?: string | null
  repoPath?: string | null
  sortOrder?: number
}

export function updateTodo(input: UpdateTodoInput): Todo {
  const fields: string[] = []
  const params: unknown[] = []

  if (input.title !== undefined) { fields.push('title = ?'); params.push(input.title) }
  if (input.description !== undefined) { fields.push('description = ?'); params.push(input.description) }
  if (input.status !== undefined) { fields.push('status = ?'); params.push(input.status) }
  if (input.priority !== undefined) { fields.push('priority = ?'); params.push(input.priority) }
  if (input.projectId !== undefined) { fields.push('project_id = ?'); params.push(input.projectId) }
  if (input.parentId !== undefined) { fields.push('parent_id = ?'); params.push(input.parentId) }
  if (input.workspaceId !== undefined) { fields.push('workspace_id = ?'); params.push(input.workspaceId) }
  if (input.repoPath !== undefined) { fields.push('repo_path = ?'); params.push(input.repoPath) }
  if (input.sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(input.sortOrder) }

  if (fields.length === 0) return getTodo(input.id)!

  fields.push("updated_at = datetime('now')")
  params.push(input.id)

  getDb().prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(input.id) as Todo
}

export function deleteTodo(id: string): void {
  getDb().prepare('DELETE FROM todos WHERE id = ?').run(id)
}
