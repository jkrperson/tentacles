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

  const handleDownload = () => {
    if (!updateStatus) return
    const url = updateStatus.downloadUrl || updateStatus.releaseUrl
      || 'https://github.com/jkrperson/tentacles/releases/latest'
    trpc.app.openExternal.mutate({ url })
  }

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
                : `Update error: ${updateStatus.message ?? 'unknown'}`}
        </span>
        {updateStatus?.status === 'available' ? (
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-[12px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors"
          >
            Download
          </button>
        ) : (
          <button
            onClick={() => trpc.updater.check.mutate()}
            disabled={updateStatus?.status === 'checking'}
            className="px-3 py-1 text-[12px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors disabled:opacity-40"
          >
            Check
          </button>
        )}
      </div>
    </div>
  )
}
