import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'

export function UserAvatar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!user) {
    return (
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => useAuthStore.getState().showLoginDialog()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="relative"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--t-bg-hover)] transition-colors"
      >
        <img
          src={user.avatarUrl}
          alt={user.login}
          className="w-6 h-6 rounded-full"
        />
        <span className="text-xs text-[var(--t-text-secondary)]">
          {user.login}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-elevated)] shadow-lg z-50 py-1">
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="w-full text-left px-3 py-2 text-xs text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
