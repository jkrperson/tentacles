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

  if (!user) return null

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
