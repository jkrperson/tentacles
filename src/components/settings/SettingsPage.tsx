import { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { trpc } from '../../trpc'
import type { AgentType, AppSettings, UpdaterStatus } from '../../types'
import { themes, builtinThemeKeys } from '../../themes'
import { useResolvedTheme, useCustomThemes } from '../../hooks/useResolvedTheme'

const AGENT_OPTIONS: { id: AgentType; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'opencode', label: 'opencode' },
]
const LSP_LANGUAGES = ['typescript', 'python', 'rust', 'go'] as const

export function SettingsPage() {
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const currentSettings = useSettingsStore((s) => s.settings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const [draft, setDraft] = useState<AppSettings>(currentSettings)
  const { customThemes, customThemeFiles, reload: reloadCustomThemes } = useCustomThemes()
  const { themeName: resolvedSystemTheme } = useResolvedTheme('system', customThemes)
  const [availableLsps, setAvailableLsps] = useState<Record<string, boolean>>({})
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus | null>(null)
  const [appVersion, setAppVersion] = useState('0.0.1')
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setDraft(currentSettings)
    trpc.lsp.listAvailable.query().then(setAvailableLsps).catch(() => {})
  }, [currentSettings])

  useEffect(() => {
    trpc.app.getVersion.query().then(setAppVersion).catch(() => {})
    const sub = trpc.updater.onStatus.subscribe(undefined, { onData: setUpdateStatus })
    return () => sub.unsubscribe()
  }, [])

  // Track changes
  useEffect(() => {
    setHasChanges(JSON.stringify(draft) !== JSON.stringify(currentSettings))
  }, [draft, currentSettings])

  const handleSave = useCallback(async () => {
    await saveSettings(draft)
  }, [draft, saveSettings])

  const handleBack = useCallback(async () => {
    if (hasChanges) {
      await saveSettings(draft)
    }
    toggleSettings()
  }, [hasChanges, draft, saveSettings, toggleSettings])

  const handleBrowse = useCallback(async () => {
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) setDraft((d) => ({ ...d, defaultProjectPath: dir }))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleBack])

  const inputClass = 'w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-violet-500/50 transition-colors'

  const toggleSwitch = (enabled: boolean, onClick: () => void, disabled?: boolean) => (
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

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-[var(--t-border)]">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[13px]">Back</span>
        </button>
        <h1 className="text-[15px] font-semibold text-zinc-200">Settings</h1>
        {hasChanges && (
          <button
            onClick={handleSave}
            className="ml-auto px-3 py-1.5 text-[12px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors"
          >
            Save Changes
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-8">

          {/* Appearance */}
          <section>
            <h2 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Appearance</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {builtinThemeKeys.map((key) => {
                    const t = themes[key]
                    const selected = draft.theme === key
                    return (
                      <button
                        key={key}
                        onClick={() => setDraft((d) => ({ ...d, theme: key }))}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                          selected
                            ? 'border-violet-500 bg-violet-500/10'
                            : 'border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)]'
                        }`}
                      >
                        <div className="flex gap-1">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.bgBase }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.accent }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.bgSurface }} />
                        </div>
                        <span className="text-[12px] text-zinc-300 capitalize">{key}</span>
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setDraft((d) => ({ ...d, theme: 'system' }))}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                      draft.theme === 'system'
                        ? 'border-violet-500 bg-violet-500/10'
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
                            onClick={() => setDraft((d) => ({ ...d, theme: key }))}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors group relative ${
                              selected
                                ? 'border-violet-500 bg-violet-500/10'
                                : 'border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)]'
                            }`}
                          >
                            <div className="flex gap-1">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.bgBase }} />
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.accent }} />
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.bgSurface }} />
                            </div>
                            <span className="text-[12px] text-zinc-300 truncate">{file.name}</span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                trpc.app.deleteCustomTheme.mutate({ key }).then(() => {
                                  reloadCustomThemes()
                                  if (draft.theme === key) setDraft((d) => ({ ...d, theme: 'obsidian' }))
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
                        setDraft((d) => ({ ...d, theme: key }))
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
                  onChange={(e) => setDraft((d) => ({ ...d, terminalFontSize: parseInt(e.target.value) || 13 }))}
                  className={inputClass} />
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Scroll Speed</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={10} value={draft.scrollSpeed}
                    onChange={(e) => setDraft((d) => ({ ...d, scrollSpeed: parseInt(e.target.value) || 5 }))}
                    className="flex-1 accent-[var(--t-accent)]" />
                  <span className="text-[13px] text-zinc-300 w-5 text-right">{draft.scrollSpeed}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Agent */}
          <section>
            <h2 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Agent</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Default Agent</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {AGENT_OPTIONS.map((agent) => {
                    const selected = draft.defaultAgent === agent.id
                    return (
                      <button
                        key={agent.id}
                        onClick={() => setDraft((d) => ({ ...d, defaultAgent: agent.id }))}
                        className={`px-2.5 py-1.5 rounded-md text-[12px] border transition-colors ${
                          selected
                            ? 'border-violet-500 bg-violet-500/10 text-zinc-200'
                            : 'border-[var(--t-border-input)] text-zinc-400 hover:border-[var(--t-border-input-hover)] hover:text-zinc-300'
                        }`}
                      >
                        {agent.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Max Agents</label>
                <input type="number" min={1} max={50} value={draft.maxSessions}
                  onChange={(e) => setDraft((d) => ({ ...d, maxSessions: parseInt(e.target.value) || 10 }))}
                  className={inputClass} />
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Default Project Path</label>
                <div className="flex gap-2">
                  <input type="text" value={draft.defaultProjectPath}
                    onChange={(e) => setDraft((d) => ({ ...d, defaultProjectPath: e.target.value }))}
                    className={`flex-1 ${inputClass}`} placeholder="/path/to/projects" />
                  <button onClick={handleBrowse}
                    className="px-3 py-2 bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md text-[12px] text-zinc-400 hover:text-zinc-200 hover:border-[var(--t-border-input-hover)] transition-colors">
                    Browse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Claude Code CLI Path</label>
                <input type="text" value={draft.claudeCliPath}
                  onChange={(e) => setDraft((d) => ({ ...d, claudeCliPath: e.target.value }))}
                  className={inputClass} placeholder="claude" />
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">Codex CLI Path</label>
                <input type="text" value={draft.codexCliPath}
                  onChange={(e) => setDraft((d) => ({ ...d, codexCliPath: e.target.value }))}
                  className={inputClass} placeholder="codex" />
              </div>

              <div>
                <label className="block text-[13px] text-zinc-300 mb-2">opencode CLI Path</label>
                <input type="text" value={draft.opencodeCliPath}
                  onChange={(e) => setDraft((d) => ({ ...d, opencodeCliPath: e.target.value }))}
                  className={inputClass} placeholder="opencode" />
              </div>
            </div>
          </section>

          {/* Language Servers */}
          <section>
            <h2 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Language Servers</h2>
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
                    {toggleSwitch(
                      enabled,
                      () => {
                        setDraft((d) => {
                          const current = d.enabledLspLanguages ?? []
                          const next = enabled
                            ? current.filter((l) => l !== lang)
                            : [...current, lang]
                          return { ...d, enabledLspLanguages: next }
                        })
                      },
                      !installed,
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* General */}
          <section>
            <h2 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">General</h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between py-2">
                <span className="text-[13px] text-zinc-300">Desktop Notifications</span>
                {toggleSwitch(
                  draft.desktopNotifications,
                  () => setDraft((d) => ({ ...d, desktopNotifications: !d.desktopNotifications })),
                )}
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-[13px] text-zinc-300">Sound Effects</span>
                {toggleSwitch(
                  draft.soundEnabled,
                  () => setDraft((d) => ({ ...d, soundEnabled: !d.soundEnabled })),
                )}
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-[13px] text-zinc-300">Media Panel</span>
                {toggleSwitch(
                  draft.enableMediaPanel,
                  () => setDraft((d) => ({ ...d, enableMediaPanel: !d.enableMediaPanel })),
                )}
              </div>
            </div>
          </section>

          {/* Updates */}
          <section>
            <h2 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Updates</h2>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-zinc-300">
                {!updateStatus || updateStatus.status === 'up-to-date'
                  ? `v${appVersion} — Up to date`
                  : updateStatus.status === 'checking'
                    ? 'Checking for updates...'
                    : updateStatus.status === 'available'
                      ? `v${updateStatus.version} available`
                      : updateStatus.status === 'downloading'
                        ? `Downloading... ${Math.round(updateStatus.percent ?? 0)}%`
                        : updateStatus.status === 'ready'
                          ? 'Update ready — restart to apply'
                          : `Update error: ${updateStatus.message ?? 'unknown'}`}
              </span>
              {updateStatus?.status === 'available' ? (
                <button
                  onClick={() => trpc.updater.download.mutate()}
                  className="px-3 py-1 text-[12px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors"
                >
                  Download
                </button>
              ) : updateStatus?.status === 'ready' ? (
                <button
                  onClick={() => trpc.updater.install.mutate()}
                  className="px-3 py-1 text-[12px] bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
                >
                  Restart
                </button>
              ) : (
                <button
                  onClick={() => trpc.updater.check.mutate()}
                  disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
                  className="px-3 py-1 text-[12px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors disabled:opacity-40"
                >
                  Check
                </button>
              )}
            </div>
          </section>

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}
