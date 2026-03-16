export function AdvancedSection() {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-500">
        Advanced settings will be available in a future update.
      </p>
      <div className="rounded-lg border border-[var(--t-border-input)] bg-[var(--t-bg-surface)] px-4 py-3">
        <span className="text-[12px] text-zinc-400">
          Planned options include developer tools toggle, custom data directory, and configuration reset.
        </span>
      </div>
    </div>
  )
}
