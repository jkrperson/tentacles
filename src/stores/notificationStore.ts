import { create } from 'zustand'
import type { AppNotification, NotificationType } from '../types'

interface NotificationState {
  notifications: AppNotification[]

  addNotification: (notification: AppNotification) => void
  removeNotification: (id: string) => void
  clearAll: () => void
  notify: (type: NotificationType, title: string, message?: string, sessionId?: string) => void
}

let notifCounter = 0

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (notification) =>
    set((state) => ({
      notifications: [...state.notifications, notification].slice(-20),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),

  notify: (type, title, message, sessionId) => {
    const notification: AppNotification = {
      id: `notif-${++notifCounter}`,
      type,
      title,
      message,
      sessionId,
      createdAt: Date.now(),
      duration: type === 'error' ? 8000 : 4000,
    }
    set((state) => ({
      notifications: [...state.notifications, notification].slice(-20),
    }))
  },
}))
