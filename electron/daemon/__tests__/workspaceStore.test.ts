import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { openDb, closeDb } from '../db'
import { createProjectStore } from '../projectStore'
import { createWorkspaceStore, WorkspaceRow } from '../workspaceStore'

let tmpDir: string
let projects: ReturnType<typeof createProjectStore>
let workspaces: ReturnType<typeof createWorkspaceStore>

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
  const db = openDb(path.join(tmpDir, 'state.db'))
  projects = createProjectStore(db)
  workspaces = createWorkspaceStore(db)
  projects.insert({
    id: '/repo', path: '/repo', name: 'repo',
    color: '#5B6B95', icon: null, addedAt: 1700000000000, sortOrder: 0,
  })
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const sample = (overrides: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  id: 'main:/repo', projectId: '/repo', type: 'main',
  branch: '', worktreePath: null, linkedPr: null, linkedIssue: null,
  status: 'active', name: 'main', createdAt: 1700000000000, sortOrder: 0,
  ...overrides,
})

describe('workspaceStore', () => {
  it('insert + get round-trips all fields including nullable ones', () => {
    workspaces.insert(sample({ type: 'worktree', worktreePath: '/wt', linkedPr: 'PR#1' }))
    expect(workspaces.get('main:/repo')).toEqual(sample({ type: 'worktree', worktreePath: '/wt', linkedPr: 'PR#1' }))
  })

  it('list returns workspaces filtered by project, ordered by sort_order', () => {
    projects.insert({
      id: '/other', path: '/other', name: 'other',
      color: '#5B6B95', icon: null, addedAt: 0, sortOrder: 1,
    })
    workspaces.insert(sample({ id: 'a', sortOrder: 1 }))
    workspaces.insert(sample({ id: 'b', sortOrder: 0 }))
    workspaces.insert(sample({ id: 'c', projectId: '/other' }))
    expect(workspaces.listByProject('/repo').map((w) => w.id)).toEqual(['b', 'a'])
  })

  it('update only mutates provided fields', () => {
    workspaces.insert(sample())
    workspaces.update('main:/repo', { status: 'merged', linkedPr: 'PR#42' })
    const row = workspaces.get('main:/repo')!
    expect(row.status).toBe('merged')
    expect(row.linkedPr).toBe('PR#42')
    expect(row.name).toBe('main')
  })

  it('cascading delete from projects removes the workspace', () => {
    workspaces.insert(sample())
    projects.delete('/repo')
    expect(workspaces.get('main:/repo')).toBeNull()
  })

  it('rejects invalid type via CHECK constraint', () => {
    expect(() => workspaces.insert(sample({ type: 'invalid' as never }))).toThrow()
  })

  it('rejects invalid status via CHECK constraint', () => {
    expect(() => workspaces.insert(sample({ status: 'archived' as never }))).toThrow()
  })

  it('reorder updates sort_order within a project', () => {
    workspaces.insert(sample({ id: 'a', sortOrder: 0 }))
    workspaces.insert(sample({ id: 'b', sortOrder: 1 }))
    workspaces.insert(sample({ id: 'c', sortOrder: 2 }))
    workspaces.reorder('/repo', ['c', 'a', 'b'])
    expect(workspaces.listByProject('/repo').map((w) => w.id)).toEqual(['c', 'a', 'b'])
  })
})
