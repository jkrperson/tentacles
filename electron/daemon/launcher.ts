import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execSync } from 'node:child_process'
import { homedir } from 'node:os'

const __launcherDir = path.dirname(fileURLToPath(import.meta.url))

const isDev = !!process.env['VITE_DEV_SERVER_URL']
const DAEMON_DIR = path.join(homedir(), '.tentacles', isDev ? 'daemon-dev' : 'daemon')
const PID_FILE = path.join(DAEMON_DIR, 'daemon.pid')
// Tracks which script launched the daemon — used to detect stale daemons
// from a different worktree or build.
const ORIGIN_FILE = path.join(DAEMON_DIR, 'daemon.origin')

export function getSocketPath(): string {
  return path.join(DAEMON_DIR, 'daemon.sock')
}

export function getScrollbackDir(): string {
  return path.join(DAEMON_DIR, 'scrollback')
}

/** Check if a daemon is already running, healthy, and ready to accept connections.
 *  This can be destructive (it may kill stale daemons in dev mode). */
export function isDaemonRunning(): boolean {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
    if (isNaN(pid)) return false
    // signal 0 checks if process exists without sending a signal
    process.kill(pid, 0)

    // Verify this PID is actually a Tentacles daemon, not a reused PID
    // after a system reboot. Check that the process command contains our daemon script.
    try {
      const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8', timeout: 2000 }).trim()
      if (!cmd.includes('daemon.mjs') && !cmd.includes('tentacles')) {
        console.log(`[daemon] Stale PID ${pid} belongs to another process, cleaning up`)
        try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
        try { fs.unlinkSync(getSocketPath()) } catch { /* ignore */ }
        return false
      }

    } catch {
      // ps failed — PID might have just died, treat as not running
      return false
    }

    // In dev, keep strict origin checks so switching worktrees/build outputs
    // doesn't accidentally attach to an unrelated daemon. In production, do
    // not force a restart on origin mismatch; preserving daemon lifetime across
    // app updates keeps existing interactive sessions usable.
    if (isDev) {
      const currentScript = path.join(__launcherDir, 'daemon.mjs')
      try {
        const originScript = fs.readFileSync(ORIGIN_FILE, 'utf-8').trim()
        if (originScript !== currentScript) {
          console.log(`[daemon] Daemon origin mismatch: running="${originScript}", current="${currentScript}", restarting`)
          try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
          try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
          try { fs.unlinkSync(getSocketPath()) } catch { /* ignore */ }
          return false
        }
      } catch {
        // No origin file — old daemon, restart to be safe in dev.
        console.log('[daemon] No origin marker found in dev mode, restarting daemon')
        try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
        try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
        try { fs.unlinkSync(getSocketPath()) } catch { /* ignore */ }
        return false
      }
    }

    // Verify the socket file exists — no socket means daemon can't accept connections.
    // NOTE: This only runs for daemons with a matching origin, so it won't kill a
    // daemon that was just launched and is still initializing (waitForDaemon checks
    // isDaemonPidAlive instead).
    if (!fs.existsSync(getSocketPath())) {
      console.log(`[daemon] PID ${pid} alive but socket missing, cleaning up`)
      try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
      try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
      return false
    }

    return true
  } catch {
    return false
  }
}

/** Non-destructive check: is the daemon PID alive and is it our daemon?
 *  Used by waitForDaemon to poll without killing a freshly launched daemon
 *  that hasn't created its socket yet. */
export function isDaemonPidAlive(): boolean {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
    if (isNaN(pid)) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Read the daemon's PID from the pid file, or null. */
export function getDaemonPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

/** Launch the daemon as a detached child process using ELECTRON_RUN_AS_NODE. */
export function launchDaemon(): void {
  fs.mkdirSync(DAEMON_DIR, { recursive: true })

  // Clean up stale socket
  const sockPath = getSocketPath()
  try { fs.unlinkSync(sockPath) } catch { /* doesn't exist */ }

  // Use the current Electron binary with ELECTRON_RUN_AS_NODE=1 to run
  // the daemon script as a plain Node.js process.
  const daemonScript = path.join(__launcherDir, 'daemon.mjs')

  const child = spawn(process.execPath, [daemonScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      TENTACLES_DAEMON_DIR: DAEMON_DIR,
    },
    detached: true,
    stdio: 'ignore',
    cwd: DAEMON_DIR,
  })

  // Write PID file immediately — the daemon will overwrite with its own PID
  // once it starts, but this provides a reference for the initial startup check.
  if (child.pid) {
    fs.writeFileSync(PID_FILE, String(child.pid))
  }

  // Record which script launched this daemon so we can detect stale daemons
  // when the app is run from a different worktree or build.
  fs.writeFileSync(ORIGIN_FILE, daemonScript)

  child.unref()
}

/** Ensure the daemon is running, launching if needed. Returns true if a new daemon was spawned. */
export function ensureDaemon(): boolean {
  if (isDaemonRunning()) return false
  launchDaemon()
  return true
}
