import type { AppSettings } from '../../../types'
import { themes, builtinThemeKeys } from '../../../themes'
import { useResolvedTheme, useCustomThemes } from '../../../hooks/useResolvedTheme'
import { trpc } from '../../../trpc'

interface AppearanceSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function AppearanceSection({ draft, onUpdate }: AppearanceSectionProps) {
  const { customThemes, customThemeFiles, reload: reloadCustomThemes } = useCustomThemes()
  const { themeName: resolvedSystemTheme } = useResolvedTheme('system', customThemes)

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Theme</label>
        <div className="grid grid-cols-3 gap-2">
          {builtinThemeKeys.map((key) => {
            const t = themes[key]
            const selected = draft.theme === key
            return (
              <button
                key={key}
                onClick={() => onUpdate((d) => ({ ...d, theme: key }))}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                  selected
                    ? 'border-[var(--t-accent)] bg-[var(--t-accent)]/10'
                    : 'border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)]'
                }`}
              >
                <div className="flex gap-1">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.ui.background }} />
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.ui.accent }} />
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.ui.surface }} />
                </div>
                <span className="text-[12px] text-zinc-300 capitalize">{key}</span>
              </button>
            )
          })}
          <button
            onClick={() => onUpdate((d) => ({ ...d, theme: 'system' }))}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
              draft.theme === 'system'
                ? 'border-[var(--t-accent)] bg-[var(--t-accent)]/10'
                : 'border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)]'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-400 flex-shrink-0">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 9.5v-6zM3.5 3a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5h-9zM5 13a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5z"/>
            </svg>
            <span className="text-[12px] text-zinc-300">
              System
              <span className="text-[10px] text-zinc-500 ml-1 capitalize">({resolvedSystemTheme})</span>
            </span>
          </button>
        </div>

        {/* Custom Themes */}
        {customThemeFiles.length > 0 && (
          <div className="mt-3">
            <span className="block text-[11px] text-zinc-600 mb-2 uppercase tracking-wider">Custom</span>
            <div className="grid grid-cols-3 gap-2">
              {customThemeFiles.map(({ key, file }) => {
                const ct = customThemes[key]
                if (!ct) return null
                const selected = draft.theme === key
                return (
                  <button
                    key={key}
                    onClick={() => onUpdate((d) => ({ ...d, theme: key }))}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors group relative ${
                      selected
                        ? 'border-[var(--t-accent)] bg-[var(--t-accent)]/10'
                        : 'border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)]'
                    }`}
                  >
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.ui.background }} />
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.ui.accent }} />
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.ui.surface }} />
                    </div>
                    <span className="text-[12px] text-zinc-300 truncate">{file.name}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        trpc.app.deleteCustomTheme.mutate({ key }).then(() => {
                          reloadCustomThemes()
                          if (draft.theme === key) onUpdate((d) => ({ ...d, theme: 'obsidian' }))
                        })
                      }}
                      className="absolute right-1.5 top-1.5 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Theme actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              const base = draft.theme.startsWith('custom:') ? 'obsidian' : (draft.theme === 'system' ? 'obsidian' : draft.theme)
              const fileName = `custom-${Date.now().toString(36)}`
              trpc.app.duplicateTheme.mutate({ base, fileName }).then((key) => {
                reloadCustomThemes()
                onUpdate((d) => ({ ...d, theme: key }))
              })
            }}
            className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors"
          >
            Duplicate Current
          </button>
          <button
            onClick={() => trpc.app.openThemesFolder.mutate()}
            className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors"
          >
            Open Themes Folder
          </button>
          <button
            onClick={reloadCustomThemes}
            className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors"
          >
            Reload
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Terminal Font Size</label>
        <input type="number" min={8} max={24} value={draft.terminalFontSize}
          onChange={(e) => onUpdate((d) => ({ ...d, terminalFontSize: parseInt(e.target.value) || 13 }))}
          className="w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors" />
      </div>

      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Scroll Speed</label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={10} value={draft.scrollSpeed}
            onChange={(e) => onUpdate((d) => ({ ...d, scrollSpeed: parseInt(e.target.value) || 5 }))}
            className="flex-1 accent-[var(--t-accent)]" />
          <span className="text-[13px] text-zinc-300 w-5 text-right">{draft.scrollSpeed}</span>
        </div>
      </div>
    </div>
  )
}
