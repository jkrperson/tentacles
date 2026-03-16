import { useEffect, useRef } from 'react'
import { useConfirmStore } from '../../stores/confirmStore'

export function ConfirmModal() {
  const { isOpen, title, message, confirmLabel, onConfirm, close } = useConfirmStore()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) confirmRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative bg-[var(--t-bg-surface)] border border-[var(--t-border)] rounded-lg shadow-xl max-w-sm w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">{title}</h3>
        <p className="text-[12px] text-zinc-400 mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 bg-[var(--t-bg-base)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => {
              onConfirm?.()
              close()
            }}
            className="px-3 py-1.5 text-[12px] font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
