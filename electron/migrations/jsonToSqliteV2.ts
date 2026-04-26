import * as fs from 'node:fs'
import type { DaemonClient } from '../daemon/client'

const PROJECT_COLORS = [
  '#5B6B95', '#5E8975', '#8E8258', '#8B5F77', '#9A5E67',
  '#9B725E', '#7F6A99', '#4E837E', '#98784F', '#5D7F99',
] as const

interface LegacyWorkspace {
  id: string
  projectId: string
  type: 'main' | 'worktree'
  branch: string
  worktreePath: string | null
  linkedPR?: string
  linkedIssue?: string
  status: 'active' | 'merged' | 'stale' | 'tearing_down'
  createdAt: number
  name: string
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

/** Migrate projectPaths (settings.json) and workspaces (sessions.json) into
 *  the daemon's SQLite store. Idempotent — safe to call on every startup. */
export async function migrateProjectsAndWorkspacesToDaemon(args: {
  settingsPath: string
  sessionsPath: string
  markerPath: string
  daemonClient: DaemonClient
}): Promise<{ projects: number; workspaces: number } | null> {
  if (fs.existsSync(args.markerPath)) return null
  if (!args.daemonClient.isConnected()) return null

  // If daemon already has projects, assume migration ran on prior launch.
  const existingProjects = await args.daemonClient.listProjects().catch(() => [])
  if (existingProjects.length > 0) {
    fs.writeFileSync(args.markerPath, new Date().toISOString())
    return { projects: 0, workspaces: 0 }
  }

  // Read settings.json for project paths
  let projectPaths: string[] = []
  try {
    const settings = JSON.parse(fs.readFileSync(args.settingsPath, 'utf-8'))
    projectPaths = Array.isArray(settings.projectPaths) ? settings.projectPaths : []
  } catch {
    // Missing or malformed — proceed with no projects.
  }

  // Read sessions.json for workspaces
  let workspaces: LegacyWorkspace[] = []
  try {
    const sessions = JSON.parse(fs.readFileSync(args.sessionsPath, 'utf-8'))
    workspaces = Array.isArray(sessions.workspaces) ? sessions.workspaces : []
  } catch {
    // Missing or malformed — proceed with no workspaces.
  }

  // Insert projects
  for (let i = 0; i < projectPaths.length; i++) {
    const p = projectPaths[i]
    await args.daemonClient.addProject(
      p,
      {
        path: p,
        name: basename(p),
        color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        icon: null,
      },
      i,
    )
  }

  // Insert workspaces (only those whose project was imported, to satisfy FK)
  const knownProjects = new Set(projectPaths)
  let workspaceCount = 0
  for (let i = 0; i < workspaces.length; i++) {
    const w = workspaces[i]
    if (!knownProjects.has(w.projectId)) continue
    await args.daemonClient.addWorkspace(
      w.id,
      {
        projectId: w.projectId,
        type: w.type,
        branch: w.branch,
        worktreePath: w.worktreePath,
        linkedPr: w.linkedPR ?? null,
        linkedIssue: w.linkedIssue ?? null,
        status: w.status,
        name: w.name,
      },
      i,
    )
    workspaceCount++
  }

  // Archive sessions.json (it had stale session entries from Phase 1's archive
  // and now we've also lifted out the workspaces).
  if (fs.existsSync(args.sessionsPath)) {
    fs.copyFileSync(args.sessionsPath, `${args.sessionsPath}.legacy-v2-${Date.now()}`)
    fs.unlinkSync(args.sessionsPath)
  }

  // Strip projectPaths from settings.json (daemon owns it now).
  try {
    const settings = JSON.parse(fs.readFileSync(args.settingsPath, 'utf-8'))
    delete settings.projectPaths
    delete settings.defaultProjectPath
    const tmp = `${args.settingsPath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2))
    fs.renameSync(tmp, args.settingsPath)
  } catch {
    // Settings unreadable; user can manually clean up.
  }

  fs.writeFileSync(args.markerPath, new Date().toISOString())
  return { projects: projectPaths.length, workspaces: workspaceCount }
}
