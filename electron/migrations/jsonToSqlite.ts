import * as fs from 'node:fs'
import type { DaemonClient } from '../daemon/client'
import type { SessionsFile } from '../../src/types'

/** Archive legacy sessions.json once on first launch with the SQLite-daemon design.
 *  Idempotent — safe to call on every startup; runs only if the marker file
 *  hasn't been written yet. */
export async function migrateSessionsJsonToDaemon(args: {
  sessionsPath: string
  markerPath: string
  daemonClient: DaemonClient
}): Promise<{ migrated: number } | null> {
  if (fs.existsSync(args.markerPath)) return null
  if (!fs.existsSync(args.sessionsPath)) {
    fs.writeFileSync(args.markerPath, new Date().toISOString())
    return { migrated: 0 }
  }
  if (!args.daemonClient.isConnected()) return null

  const existing = await args.daemonClient.list().catch(() => [])
  if (existing.length > 0) {
    // Daemon already has sessions — assume migration already happened on
    // a previous launch; just write the marker and skip.
    fs.writeFileSync(args.markerPath, new Date().toISOString())
    return { migrated: 0 }
  }

  let parsed: SessionsFile
  try {
    parsed = JSON.parse(fs.readFileSync(args.sessionsPath, 'utf-8'))
  } catch {
    fs.writeFileSync(args.markerPath, new Date().toISOString())
    return { migrated: 0 }
  }

  // We can't actually re-spawn dead PTYs. The legacy sessions in the file
  // are reference-only — we have no live PTY to attach. The honest move is
  // to skip importing them as live sessions and instead archive the file.
  // Workspaces inside the file are still loaded via app.loadSessions for the
  // workspace-bridge state (see sessionStore.loadSessions), so we KEEP a copy.
  fs.copyFileSync(args.sessionsPath, `${args.sessionsPath}.legacy-${Date.now()}`)

  // Strip the dead session entries from the live sessions.json so the
  // workspace-bridge query doesn't see them. Workspaces stay intact.
  const stripped = {
    sessions: [],
    activeSessionId: null,
    tabOrder: [],
    workspaces: parsed.workspaces ?? [],
  }
  const tmp = `${args.sessionsPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(stripped, null, 2))
  fs.renameSync(tmp, args.sessionsPath)

  fs.writeFileSync(args.markerPath, new Date().toISOString())
  return { migrated: (parsed.sessions ?? []).length }
}
