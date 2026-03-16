interface ToggleSwitchProps {
  enabled: boolean
  onClick: () => void
  disabled?: boolean
}

export function ToggleSwitch({ enabled, onClick, disabled }: ToggleSwitchProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-5 rounded-full transition-colors relative ${
        disabled ? 'opacity-40 cursor-not-allowed bg-[var(--t-border-input)]' :
        enabled ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'
      }`}
    >
      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${enabled ? 'left-[18px]' : 'left-[3px]'}`} />
    </button>
  )
}
