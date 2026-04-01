import { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AppSettings } from '../../types'
import { SettingsNav } from './SettingsNav'
import { GeneralSection } from './sections/GeneralSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { TerminalSection } from './sections/TerminalSection'
import { EditorSection } from './sections/EditorSection'
import { KeybindingsSection } from './sections/KeybindingsSection'
import { NotificationsSection } from './sections/NotificationsSection'
import { LspSection } from './sections/LspSection'
import { UpdatesSection } from './sections/UpdatesSection'
import { AdvancedSection } from './sections/AdvancedSection'
import { AgentsSection } from './sections/AgentsSection'
import { DictationSection } from './sections/DictationSection'

export type SettingsSection =
  | 'general'
  | 'agents'
  | 'appearance'
  | 'terminal'
  | 'notifications'
  | 'editor'
  | 'keybindings'
  | 'dictation'
  | 'lsp'
  | 'updates'
  | 'advanced'

const SECTION_TITLES: Record<SettingsSection, string> = {
  general: 'General',
  agents: 'Agents',
  appearance: 'Appearance',
  terminal: 'Terminal',
  notifications: 'Notifications',
  editor: 'Editor',
  keybindings: 'Keybindings',
  dictation: 'Dictation',
  lsp: 'Language Servers',
  updates: 'Updates',
  advanced: 'Advanced',
}

export function SettingsPage() {
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const currentSettings = useSettingsStore((s) => s.settings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const [draft, setDraft] = useState<AppSettings>(currentSettings)
  const [hasChanges, setHasChanges] = useState(false)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  useEffect(() => {
    setDraft(currentSettings)
  }, [currentSettings])

  useEffect(() => {
    setHasChanges(JSON.stringify(draft) !== JSON.stringify(currentSettings))
  }, [draft, currentSettings])

  const handleUpdate = useCallback((updater: (d: AppSettings) => AppSettings) => {
    setDraft(updater)
  }, [])

  const handleSave = useCallback(async () => {
    await saveSettings(draft)
  }, [draft, saveSettings])

  const handleBack = useCallback(async () => {
    if (hasChanges) {
      await saveSettings(draft)
    }
    toggleSettings()
  }, [hasChanges, draft, saveSettings, toggleSettings])

  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen)

  useEffect(() => {
    if (!isSettingsOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isSettingsOpen, handleBack])

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSection draft={draft} onUpdate={handleUpdate} />
      case 'agents':
        return <AgentsSection draft={draft} onUpdate={handleUpdate} />
      case 'appearance':
        return <AppearanceSection draft={draft} onUpdate={handleUpdate} />
      case 'terminal':
        return <TerminalSection draft={draft} onUpdate={handleUpdate} />
      case 'notifications':
        return <NotificationsSection draft={draft} onUpdate={handleUpdate} />
      case 'editor':
        return <EditorSection />
      case 'keybindings':
        return <KeybindingsSection />
      case 'dictation':
        return <DictationSection draft={draft} onUpdate={handleUpdate} />
      case 'lsp':
        return <LspSection draft={draft} onUpdate={handleUpdate} />
      case 'updates':
        return <UpdatesSection />
      case 'advanced':
        return <AdvancedSection draft={draft} onUpdate={handleUpdate} />
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg-base)]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-[var(--t-border)]">
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

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 flex">
        <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl px-8 py-6">
            <h2 className="text-[13px] font-medium text-zinc-400 uppercase tracking-wider mb-5">
              {SECTION_TITLES[activeSection]}
            </h2>
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  )
}
