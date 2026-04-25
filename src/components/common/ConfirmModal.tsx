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
      {/* Backdrop — frosted, picks up the scene below */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--t-bg-base) 55%, transparent)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Modal — glass island */}
      <div
        className="relative glass rounded-xl max-w-sm w-full mx-4 p-5 animate-lift-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-[var(--t-text-primary)] tracking-tight mb-2">{title}</h3>
        <p className="text-[12px] text-[var(--t-text-secondary)] mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-[12px] text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] bg-[var(--t-bg-base)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-hairline-strong)] rounded transition-[color,background-color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => {
              onConfirm?.()
              close()
            }}
            className="px-3 py-1.5 text-[12px] font-medium text-white bg-[var(--t-status-errored)] hover:opacity-90 rounded transition-[opacity,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.96]"
            style={{ boxShadow: 'inset 0 1px 0 0 color-mix(in srgb, white 22%, transparent)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
