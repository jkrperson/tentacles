import { create } from 'zustand'

interface ConfirmState {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: (() => void) | null

  show: (opts: { title: string; message: string; confirmLabel?: string; onConfirm: () => void }) => void
  close: () => void
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  onConfirm: null,

  show: ({ title, message, confirmLabel, onConfirm }) =>
    set({ isOpen: true, title, message, confirmLabel: confirmLabel ?? 'Confirm', onConfirm }),

  close: () => set({ isOpen: false, onConfirm: null }),
}))
