import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { migrateProjectsAndWorkspacesToDaemon } from '../jsonToSqliteV2'

let tmpDir: string
let settingsPath: string
let sessionsPath: string
let markerPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-v2-'))
  settingsPath = path.join(tmpDir, 'settings.json')
  sessionsPath = path.join(tmpDir, 'sessions.json')
  markerPath = path.join(tmpDir, '.sqlite-migrated-v2')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const fakeClient = (opts: {
  connected?: boolean
  existingProjects?: Array<{ id: string }>
  existingWorkspaces?: Array<{ id: string }>
  added?: { projects: unknown[]; workspaces: unknown[] }
} = {}) => {
  const projects: unknown[] = []
  const workspaces: unknown[] = []
  return {
    isConnected: () => opts.connected ?? true,
    listProjects: async () => opts.existingProjects ?? [],
    listWorkspaces: async () => opts.existingWorkspaces ?? [],
    addProject: async (id: string, metadata: unknown, sortOrder: number) => {
      projects.push({ id, metadata, sortOrder })
      if (opts.added) opts.added.projects = projects
    },
    addWorkspace: async (id: string, metadata: unknown, sortOrder: number) => {
      workspaces.push({ id, metadata, sortOrder })
      if (opts.added) opts.added.workspaces = workspaces
    },
  } as unknown as Parameters<typeof migrateProjectsAndWorkspacesToDaemon>[0]['daemonClient']
}

describe('migrateProjectsAndWorkspacesToDaemon', () => {
  it('returns null when marker exists', async () => {
    fs.writeFileSync(markerPath, 'done')
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient(),
    })
    expect(result).toBeNull()
  })

  it('returns 0 + writes marker when no source files exist', async () => {
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient(),
    })
    expect(result).toEqual({ projects: 0, workspaces: 0 })
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('imports projects from settings.projectPaths in order', async () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ projectPaths: ['/a', '/b', '/c'] }))
    const captured: { projects: unknown[]; workspaces: unknown[] } = { projects: [], workspaces: [] }
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient({ added: captured }),
    })
    expect(result).toEqual({ projects: 3, workspaces: 0 })
    expect(captured.projects.map((p) => (p as { id: string }).id)).toEqual(['/a', '/b', '/c'])
  })

  it('imports workspaces from sessions.json.workspaces', async () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ projectPaths: ['/repo'] }))
    fs.writeFileSync(sessionsPath, JSON.stringify({
      workspaces: [
        { id: 'main:/repo', projectId: '/repo', type: 'main', branch: '', worktreePath: null, status: 'active', createdAt: 1, name: 'main' },
        { id: 'worktree:/wt', projectId: '/repo', type: 'worktree', branch: 'feat', worktreePath: '/wt', status: 'active', createdAt: 2, name: 'feat' },
      ],
    }))
    const captured: { projects: unknown[]; workspaces: unknown[] } = { projects: [], workspaces: [] }
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient({ added: captured }),
    })
    expect(result).toEqual({ projects: 1, workspaces: 2 })
    expect(captured.workspaces.map((w) => (w as { id: string }).id)).toEqual(['main:/repo', 'worktree:/wt'])
  })

  it('skips when daemon already has projects', async () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ projectPaths: ['/a'] }))
    const captured: { projects: unknown[]; workspaces: unknown[] } = { projects: [], workspaces: [] }
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath,
      daemonClient: fakeClient({ existingProjects: [{ id: '/x' }], added: captured }),
    })
    expect(result).toEqual({ projects: 0, workspaces: 0 })
    expect(captured.projects).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('returns null when daemon disconnected', async () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ projectPaths: ['/a'] }))
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient({ connected: false }),
    })
    expect(result).toBeNull()
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('writes marker on bad JSON without crashing', async () => {
    fs.writeFileSync(settingsPath, '{not valid json')
    const result = await migrateProjectsAndWorkspacesToDaemon({
      settingsPath, sessionsPath, markerPath, daemonClient: fakeClient(),
    })
    expect(result).toEqual({ projects: 0, workspaces: 0 })
    expect(fs.existsSync(markerPath)).toBe(true)
  })
})
