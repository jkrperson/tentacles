import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../types'
import { trpc } from '../../../trpc'
import { ToggleSwitch } from '../settingsControls'

const LSP_LANGUAGES = ['typescript', 'python', 'rust', 'go'] as const

interface LspSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function LspSection({ draft, onUpdate }: LspSectionProps) {
  const [availableLsps, setAvailableLsps] = useState<Record<string, boolean>>({})

  useEffect(() => {
    trpc.lsp.listAvailable.query().then(setAvailableLsps).catch(() => {})
  }, [])

  return (
    <div className="space-y-1">
      {LSP_LANGUAGES.map((lang) => {
        const installed = availableLsps[lang] ?? false
        const enabled = draft.enabledLspLanguages?.includes(lang) ?? false
        return (
          <div key={lang} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-zinc-300 capitalize">{lang}</span>
              {!installed && (
                <span className="text-[10px] text-zinc-600 px-1.5 py-0.5 rounded bg-zinc-800/50">Not installed</span>
              )}
            </div>
            <ToggleSwitch
              enabled={enabled}
              onClick={() => {
                onUpdate((d) => {
                  const current = d.enabledLspLanguages ?? []
                  const next = enabled
                    ? current.filter((l) => l !== lang)
                    : [...current, lang]
                  return { ...d, enabledLspLanguages: next }
                })
              }}
              disabled={!installed}
            />
          </div>
        )
      })}
    </div>
  )
}
