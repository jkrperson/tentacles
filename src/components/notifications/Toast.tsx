import { useEffect, useState } from 'react'
import type { AppNotification } from '../../types'
import { useNotificationStore } from '../../stores/notificationStore'
import { useSessionStore } from '../../stores/sessionStore'

const TYPE_STYLES: Record<string, string> = {
  info: 'border-blue-500/20 bg-[var(--t-bg-surface)]',
  success: 'border-emerald-500/20 bg-[var(--t-bg-surface)]',
  warning: 'border-amber-500/20 bg-[var(--t-bg-surface)]',
  error: 'border-red-500/20 bg-[var(--t-bg-surface)]',
}

export function Toast({ notification }: { notification: AppNotification }) {
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const setActive = useSessionStore((s) => s.setActiveSession)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), notification.duration - 200)
    const removeTimer = setTimeout(() => removeNotification(notification.id), notification.duration)
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer) }
  }, [notification.id, notification.duration, removeNotification])

  return (
    <div
      onClick={() => {
        if (notification.sessionId) setActive(notification.sessionId)
        removeNotification(notification.id)
      }}
      className={`animate-slide-in ${fading ? 'animate-fade-out' : ''} cursor-pointer rounded-lg border px-4 py-3 shadow-2xl max-w-72 ${
        TYPE_STYLES[notification.type] ?? TYPE_STYLES.info
      }`}
    >
      <div className="text-[13px] font-medium text-zinc-200">{notification.title}</div>
      {notification.message && (
        <div className="text-[11px] text-zinc-500 mt-0.5">{notification.message}</div>
      )}
    </div>
  )
}
