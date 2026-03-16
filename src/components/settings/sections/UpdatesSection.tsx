import { useEffect, useState } from 'react'
import type { UpdaterStatus } from '../../../types'
import { trpc } from '../../../trpc'

export function UpdatesSection() {
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus | null>(null)
  const [appVersion, setAppVersion] = useState('0.0.1')

  useEffect(() => {
    trpc.app.getVersion.query().then(setAppVersion).catch(() => {})
    const sub = trpc.updater.onStatus.subscribe(undefined, { onData: setUpdateStatus })
    return () => sub.unsubscribe()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-zinc-300">
          {!updateStatus || updateStatus.status === 'up-to-date'
            ? `v${appVersion} — Up to date`
            : updateStatus.status === 'checking'
              ? 'Checking for updates...'
              : updateStatus.status === 'available'
                ? `v${updateStatus.version} available`
                : updateStatus.status === 'downloading'
                  ? `Downloading... ${Math.round(updateStatus.percent ?? 0)}%`
                  : updateStatus.status === 'ready'
                    ? 'Update ready — restart to apply'
                    : `Update error: ${updateStatus.message ?? 'unknown'}`}
        </span>
        {updateStatus?.status === 'available' ? (
          <button
            onClick={() => trpc.updater.download.mutate()}
            className="px-3 py-1 text-[12px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors"
          >
            Download
          </button>
        ) : updateStatus?.status === 'ready' ? (
          <button
            onClick={() => trpc.updater.install.mutate()}
            className="px-3 py-1 text-[12px] bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
          >
            Restart
          </button>
        ) : (
          <button
            onClick={() => trpc.updater.check.mutate()}
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
