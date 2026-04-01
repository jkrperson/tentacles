import type { AppSettings } from '../../../types'
import { ToggleSwitch } from '../settingsControls'

interface AdvancedSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function AdvancedSection({ draft, onUpdate }: AdvancedSectionProps) {
  return (
    <div className="space-y-6">
      {/* Telemetry */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] text-[var(--t-text-primary)]">Send anonymous usage data</div>
          <div className="text-[11px] text-[var(--t-text-secondary)] mt-0.5">
            Help improve Tentacles by sending anonymous usage analytics. No code, file paths, or personal data is ever collected.
          </div>
        </div>
        <ToggleSwitch
          enabled={draft.telemetryEnabled}
          onClick={() => onUpdate((d) => ({ ...d, telemetryEnabled: !d.telemetryEnabled }))}
        />
      </div>
    </div>
  )
}
