import { useEffect, useState } from 'react'
import type { UpdaterStatus } from '../types'
import { trpc } from '../trpc'

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    const sub = trpc.updater.onStatus.subscribe(undefined, { onData: setStatus })
    return () => sub.unsubscribe()
  }, [])

  // Don't show if no update, not available, or user dismissed this version
  if (!status || status.status !== 'available' || !status.version) return null
  if (dismissed === status.version) return null

  const handleDownload = () => {
    const url = status.downloadUrl || status.releaseUrl
      || `https://github.com/jkrperson/tentacles/releases/latest`
    trpc.app.openExternal.mutate({ url })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--t-accent)]/15 border-b border-[var(--t-accent)]/30 text-[12px]">
      <span className="text-zinc-300 flex-1">
        <span className="font-medium text-[var(--t-accent)]">v{status.version}</span>
        {' is out! Auto-update unavailable (code signing costs money we don\'t have). Grab the new version — it\'ll only take a sec.'}
      </span>
      <button
        onClick={handleDownload}
        className="px-3 py-1 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors flex-shrink-0 font-medium"
      >
        Download
      </button>
      <button
        onClick={() => setDismissed(status.version!)}
        className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>
    </div>
  )
}
