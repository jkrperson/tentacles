import { useEffect, useRef, useState } from 'react'
import type { UpdaterStatus } from '../types'
import { trpc } from '../trpc'

const SNOOZE_MS = 4 * 60 * 60 * 1000 // 4 hours
const snoozeKey = (version: string) => `updater.snooze.${version}`

function snoozedUntil(version: string): number {
  const raw = localStorage.getItem(snoozeKey(version))
  return raw ? Number(raw) || 0 : 0
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [snoozeTick, setSnoozeTick] = useState(0)
  const snoozeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const sub = trpc.updater.onStatus.subscribe(undefined, { onData: setStatus })
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    return () => {
      if (snoozeTimer.current) clearTimeout(snoozeTimer.current)
    }
  }, [])

  if (!status || status.status !== 'downloaded' || !status.version) return null

  const expiresAt = snoozedUntil(status.version)
  if (expiresAt > Date.now()) return null

  const handleRestart = () => {
    trpc.updater.restartAndInstall.mutate()
  }

  const handleSnooze = () => {
    if (!status.version) return
    const until = Date.now() + SNOOZE_MS
    localStorage.setItem(snoozeKey(status.version), String(until))
    if (snoozeTimer.current) clearTimeout(snoozeTimer.current)
    snoozeTimer.current = setTimeout(() => setSnoozeTick((t) => t + 1), SNOOZE_MS)
    setSnoozeTick((t) => t + 1)
  }

  // Reference snoozeTick so React re-evaluates after the timer fires.
  void snoozeTick

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--t-accent)]/15 border-b border-[var(--t-accent)]/30 text-[12px]">
      <span className="text-zinc-300 flex-1">
        <span className="font-medium text-[var(--t-accent)]">v{status.version}</span>
        {' is ready to install. Restart to update.'}
      </span>
      <button
        onClick={handleRestart}
        className="px-3 py-1 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors flex-shrink-0 font-medium"
      >
        Restart and update
      </button>
      <button
        onClick={handleSnooze}
        className="px-3 py-1 text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0"
      >
        Update later
      </button>
    </div>
  )
}
