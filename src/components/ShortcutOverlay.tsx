import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_DEFS, resolveKeys, formatKeys } from '../shortcuts'

export function ShortcutOverlay() {
  const isOpen = useUIStore((s) => s.shortcutOverlayOpen)
  const close = useUIStore((s) => s.setShortcutOverlayOpen)
  const custom = useSettingsStore((s) => s.settings.customKeybindings ?? {})

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  // Group by category
  const categories = new Map<string, typeof SHORTCUT_DEFS>()
  for (const def of SHORTCUT_DEFS) {
    const list = categories.get(def.category) ?? []
    list.push(def)
    categories.set(def.category, list)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onClick={() => close(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-[var(--t-bg-surface)] border border-[var(--t-border)] rounded-xl shadow-2xl w-[520px] max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--t-border)]">
          <h2 className="text-[14px] font-semibold text-zinc-200">Keyboard Shortcuts</h2>
          <button
            onClick={() => close(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {Array.from(categories.entries()).map(([category, defs]) => (
            <div key={category}>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{category}</h3>
              <div className="rounded-lg border border-[var(--t-border-input)] overflow-hidden">
                {defs.map((def, i) => {
                  const keys = resolveKeys(def.id, custom)
                  const isCustom = !!custom[def.id]
                  return (
                    <div
                      key={def.id}
                      className={`flex items-center justify-between px-3 py-2 ${
                        i > 0 ? 'border-t border-[var(--t-border-input)]' : ''
                      }`}
                    >
                      <span className="text-[12px] text-zinc-300">{def.label}</span>
                      <div className="flex items-center gap-1.5">
                        {isCustom && (
                          <span className="text-[9px] text-violet-400 uppercase tracking-wider">custom</span>
                        )}
                        <kbd className="px-2 py-0.5 text-[11px] text-zinc-400 bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded font-mono min-w-[28px] text-center">
                          {formatKeys(keys)}
                        </kbd>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--t-border)] text-[11px] text-zinc-500">
          Customize shortcuts in Settings → Keybindings
        </div>
      </div>
    </div>,
    document.body,
  )
}
