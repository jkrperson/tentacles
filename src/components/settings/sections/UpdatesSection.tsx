import { useEffect, useState } from 'react'
import type { UpdaterStatus } from '../../../types'
import { trpc } from '../../../trpc'

function statusLabel(s: UpdaterStatus | null, appVersion: string): string {
  if (!s) return `v${appVersion}`
  switch (s.status) {
    case 'checking': return 'Checking for updates...'
    case 'available': return `v${s.version} found — downloading...`
    case 'downloading': return `Downloading v${s.version ?? ''}${s.progress != null ? ` (${s.progress}%)` : '...'}`
    case 'downloaded': return `v${s.version} ready to install`
    case 'up-to-date': return `v${appVersion} — up to date`
    case 'error': return `Update error: ${s.message ?? 'unknown'}`
    default: return `v${appVersion}`
  }
}

export function UpdatesSection() {
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus | null>(null)
  const [appVersion, setAppVersion] = useState('0.0.1')

  useEffect(() => {
    trpc.app.getVersion.query().then(setAppVersion).catch(() => {})
    const sub = trpc.updater.onStatus.subscribe(undefined, { onData: setUpdateStatus })
    return () => sub.unsubscribe()
  }, [])

  const handleRestart = () => trpc.updater.restartAndInstall.mutate()
  const handleCheck = () => trpc.updater.check.mutate()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-zinc-300">
          {statusLabel(updateStatus, appVersion)}
        </span>
        {updateStatus?.status === 'downloaded' ? (
          <button
            onClick={handleRestart}
            className="px-3 py-1 text-[12px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors"
          >
            Restart and update
          </button>
        ) : (
          <button
            onClick={handleCheck}
            disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
            className="px-3 py-1 text-[12px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors disabled:opacity-40"
          >
            Check
          </button>
        )}
      </div>
    </div>
  )
}
