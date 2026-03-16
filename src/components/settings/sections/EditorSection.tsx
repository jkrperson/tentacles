export function EditorSection() {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-500">
        Editor preferences will be available in a future update.
      </p>
      <div className="rounded-lg border border-[var(--t-border-input)] bg-[var(--t-bg-surface)] px-4 py-3">
        <span className="text-[12px] text-zinc-400">
          The read-only file viewer currently uses Monaco with default settings. Customization options for word wrap, minimap, and line numbers are planned.
        </span>
      </div>
    </div>
  )
}
