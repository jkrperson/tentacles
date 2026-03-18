import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

const __launcherDir = path.dirname(fileURLToPath(import.meta.url))

const isDev = !!process.env['VITE_DEV_SERVER_URL']
const DAEMON_DIR = path.join(homedir(), '.tentacles', isDev ? 'daemon-dev' : 'daemon')
const PID_FILE = path.join(DAEMON_DIR, 'daemon.pid')

export function getSocketPath(): string {
  return path.join(DAEMON_DIR, 'daemon.sock')
}

export function getScrollbackDir(): string {
  return path.join(DAEMON_DIR, 'scrollback')
}

/** Check if a daemon is already running by verifying the PID file. */
export function isDaemonRunning(): boolean {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
    if (isNaN(pid)) return false
    // signal 0 checks if process exists without sending a signal
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

  child.unref()
}

/** Ensure the daemon is running, launching if needed. Returns true if a new daemon was spawned. */
export function ensureDaemon(): boolean {
  if (isDaemonRunning()) return false
  launchDaemon()
  return true
}
