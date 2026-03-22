import { useState, useRef, useEffect } from 'react'

interface SplitButtonOption {
  label: string
  value: string
}

interface SplitButtonProps {
  options: SplitButtonOption[]
  selectedValue: string
  onSelect: (value: string) => void
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
}

export function SplitButton({ options, selectedValue, onSelect, onClick, disabled, loading, loadingLabel }: SplitButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find((o) => o.value === selectedValue) ?? options[0]

  return (
    <div ref={ref} className="relative flex w-full">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className="flex-1 text-[12px] py-1 rounded-l bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white disabled:opacity-40 transition-colors"
      >
        {loading ? (loadingLabel ?? 'Working...') : selected.label}
      </button>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled || loading}
        className="flex-shrink-0 px-1.5 py-1 rounded-r bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white disabled:opacity-40 transition-colors border-l border-white/20"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--t-bg-base)] border border-[var(--t-border)] rounded shadow-lg z-50 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onSelect(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--t-bg-hover)] transition-colors ${
                opt.value === selectedValue ? 'text-[var(--t-accent)]' : 'text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
