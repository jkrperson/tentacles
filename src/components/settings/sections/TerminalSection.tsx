import type { AppSettings } from '../../../types'

interface TerminalSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function TerminalSection({ draft, onUpdate }: TerminalSectionProps) {
  const inputClass = 'w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors'

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Font Family</label>
        <input type="text" value={draft.terminalFontFamily}
          onChange={(e) => onUpdate((d) => ({ ...d, terminalFontFamily: e.target.value }))}
          className={inputClass} placeholder="'JetBrains Mono', Menlo, monospace" />
      </div>
    </div>
  )
}
