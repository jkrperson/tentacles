export function KeybindingsSection() {
  const shortcuts = [
    { keys: '⌘ N', action: 'New session' },
    { keys: '⌘ ,', action: 'Open settings' },
    { keys: '⌘ K', action: 'Command palette' },
    { keys: '⌘ W', action: 'Close session' },
    { keys: '⌘ ↑/↓', action: 'Navigate sessions' },
    { keys: '⌘ 1-9', action: 'Switch to session' },
    { keys: 'Escape', action: 'Close settings / overlay' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--t-border-input)] overflow-hidden">
        {shortcuts.map((shortcut, i) => (
          <div
            key={shortcut.keys}
            className={`flex items-center justify-between px-4 py-2.5 ${
              i > 0 ? 'border-t border-[var(--t-border-input)]' : ''
            }`}
          >
            <span className="text-[13px] text-zinc-300">{shortcut.action}</span>
            <kbd className="px-2 py-0.5 text-[11px] text-zinc-400 bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded font-mono">
              {shortcut.keys}
            </kbd>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-zinc-500">
        Custom keybinding configuration will be available in a future update.
      </p>
    </div>
  )
}
