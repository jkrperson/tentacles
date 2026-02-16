import { useNotificationStore } from '../../stores/notificationStore'
import { Toast } from './Toast'

export function ToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications)
  const visible = notifications.slice(-5)

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {visible.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <Toast notification={n} />
        </div>
      ))}
    </div>
  )
}
