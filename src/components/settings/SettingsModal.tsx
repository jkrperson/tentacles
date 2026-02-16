import { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AppSettings } from '../../types'
import { themes } from '../../themes'

const themeKeys = Object.keys(themes) as string[]

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isSettingsOpen)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const currentSettings = useSettingsStore((s) => s.settings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const [draft, setDraft] = useState<AppSettings>(currentSettings)

  useEffect(() => {
    if (isOpen) setDraft(currentSettings)
  }, [isOpen, currentSettings])

  const handleSave = useCallback(async () => {
    await saveSettings(draft)
    toggleSettings()
  }, [draft, saveSettings, toggleSettings])

  const handleBrowse = useCallback(async () => {
    const dir = await window.electronAPI.dialog.selectDirectory()
    if (dir) setDraft((d) => ({ ...d, defaultProjectPath: dir }))
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleSettings() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, toggleSettings])

  if (!isOpen) return null

  const inputClass = 'w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-violet-500/50 transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--t-bg-elevated)] border border-[var(--t-border-input)] rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--t-border)]">
          <h2 className="text-[14px] font-semibold text-zinc-200">Settings</h2>
          <button onClick={toggleSettings} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider">Theme</label>
            <div className="grid grid-cols-2 gap-2">
              {themeKeys.map((key) => {
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
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider">Max Agents</label>
            <input type="number" min={1} max={50} value={draft.maxSessions}
              onChange={(e) => setDraft((d) => ({ ...d, maxSessions: parseInt(e.target.value) || 10 }))}
              className={inputClass} />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider">Default Project Path</label>
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
            <label className="block text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider">Claude CLI Path</label>
            <input type="text" value={draft.claudeCliPath}
              onChange={(e) => setDraft((d) => ({ ...d, claudeCliPath: e.target.value }))}
              className={inputClass} placeholder="claude" />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider">Terminal Font Size</label>
            <input type="number" min={8} max={24} value={draft.terminalFontSize}
              onChange={(e) => setDraft((d) => ({ ...d, terminalFontSize: parseInt(e.target.value) || 13 }))}
              className={inputClass} />
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-[13px] text-zinc-400">Desktop Notifications</span>
            <button
              onClick={() => setDraft((d) => ({ ...d, desktopNotifications: !d.desktopNotifications }))}
              className={`w-9 h-5 rounded-full transition-colors relative ${draft.desktopNotifications ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'}`}
            >
              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${draft.desktopNotifications ? 'left-[18px]' : 'left-[3px]'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-[13px] text-zinc-400">Sound Effects</span>
            <button
              onClick={() => setDraft((d) => ({ ...d, soundEnabled: !d.soundEnabled }))}
              className={`w-9 h-5 rounded-full transition-colors relative ${draft.soundEnabled ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'}`}
            >
              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${draft.soundEnabled ? 'left-[18px]' : 'left-[3px]'}`} />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--t-border)]">
          <button onClick={toggleSettings}
            className="px-4 py-2 text-[13px] text-zinc-400 hover:text-zinc-200 rounded-md hover:bg-[var(--t-border)] transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 text-[13px] bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-md transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
