import { useEffect, useState, useCallback } from 'react'
import type { AppSettings, CustomSoundFile, NotificationEvent } from '../../../types'
import { trpc } from '../../../trpc'
import { ToggleSwitch } from '../settingsControls'
import { previewSound, clearSoundCache } from '../../../hooks/useSoundPlayer'

const BUILTIN_SOUNDS = [
  { key: 'none', label: 'None' },
  { key: 'builtin:chime', label: 'Chime' },
  { key: 'builtin:ping', label: 'Ping' },
  { key: 'builtin:bell', label: 'Bell' },
]

const NOTIFICATION_EVENTS: { key: NotificationEvent; label: string; description: string }[] = [
  { key: 'completed', label: 'Task Completed', description: 'Agent finished its task' },
  { key: 'needsInput', label: 'Needs Input', description: 'Agent is waiting for permission' },
  { key: 'exited', label: 'Session Exited', description: 'Agent process exited' },
]

interface NotificationsSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

export function NotificationsSection({ draft, onUpdate }: NotificationsSectionProps) {
  const [customSounds, setCustomSounds] = useState<CustomSoundFile[]>([])

  const loadSounds = useCallback(() => {
    trpc.app.listCustomSounds.query().then(setCustomSounds).catch(() => {})
  }, [])

  useEffect(() => {
    loadSounds()
  }, [loadSounds])

  const handleAddSound = useCallback(async () => {
    const added = await trpc.app.addCustomSound.mutate()
    if (added) {
      clearSoundCache()
      loadSounds()
    }
  }, [loadSounds])

  const handleDeleteSound = useCallback(async (key: string) => {
    await trpc.app.deleteCustomSound.mutate({ key })
    clearSoundCache()
    // Reset any event that used this sound to 'none'
    onUpdate((d) => {
      const sounds = { ...d.notificationSounds }
      for (const event of NOTIFICATION_EVENTS) {
        if (sounds[event.key] === key) {
          sounds[event.key] = 'none'
        }
      }
      return { ...d, notificationSounds: sounds }
    })
    loadSounds()
  }, [loadSounds, onUpdate])

  const handleSoundChange = useCallback((event: NotificationEvent, soundKey: string) => {
    onUpdate((d) => ({
      ...d,
      notificationSounds: {
        ...d.notificationSounds,
        [event]: soundKey,
      },
    }))
  }, [onUpdate])

  const allSoundOptions = [
    ...BUILTIN_SOUNDS,
    ...customSounds.map((s) => ({ key: s.key, label: s.name })),
  ]

  return (
    <div className="space-y-6">
      {/* Master toggles */}
      <div className="space-y-1">
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-[13px] text-zinc-300">Desktop Notifications</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Show native OS notifications for agent events</p>
          </div>
          <ToggleSwitch
            enabled={draft.desktopNotifications}
            onClick={() => onUpdate((d) => ({ ...d, desktopNotifications: !d.desktopNotifications }))}
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-[13px] text-zinc-300">Sound Effects</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Play sounds when agent events occur</p>
          </div>
          <ToggleSwitch
            enabled={draft.soundEnabled}
            onClick={() => onUpdate((d) => ({ ...d, soundEnabled: !d.soundEnabled }))}
          />
        </div>
      </div>

      {/* Per-event sound configuration */}
      {draft.soundEnabled && (
        <div>
          <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Event Sounds</h3>
          <div className="space-y-3">
            {NOTIFICATION_EVENTS.map((event) => {
              const currentSound = draft.notificationSounds?.[event.key] ?? 'none'
              return (
                <div key={event.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-[13px] text-zinc-300">{event.label}</span>
                    <p className="text-[11px] text-zinc-500">{event.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <select
                      value={currentSound}
                      onChange={(e) => handleSoundChange(event.key, e.target.value)}
                      className="bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-2.5 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors appearance-none pr-7 cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 6px center',
                      }}
                    >
                      {allSoundOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                    {currentSound !== 'none' && (
                      <button
                        onClick={() => previewSound(currentSound)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                        title="Preview sound"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
                          <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/>
                          <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Custom sounds management */}
      {draft.soundEnabled && (
        <div>
          <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Custom Sounds</h3>
          {customSounds.length > 0 && (
            <div className="rounded-lg border border-[var(--t-border-input)] overflow-hidden mb-3">
              {customSounds.map((sound, i) => (
                <div
                  key={sound.key}
                  className={`flex items-center justify-between px-3 py-2 ${
                    i > 0 ? 'border-t border-[var(--t-border-input)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-500 flex-shrink-0">
                      <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13c0-1.104 1.12-2 2.5-2s2.5.896 2.5 2zm9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2z"/>
                      <path fillRule="evenodd" d="M14 11V2h-1v9h1zM6 3v10H5V3h1z"/>
                      <path d="M5 2.905a1 1 0 0 1 .9-.995l8-.8a1 1 0 0 1 1.1.995V3.5a1 1 0 0 1-.9.995l-8 .8a1 1 0 0 1-1.1-.995V2.905z"/>
                    </svg>
                    <span className="text-[12px] text-zinc-300 truncate">{sound.name}</span>
                    <span className="text-[10px] text-zinc-600">{sound.filename.split('.').pop()?.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => previewSound(sound.key)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Preview"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 4l8 4-8 4V4z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteSound(sound.key)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Remove"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAddSound}
              className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors"
            >
              Add Sound File
            </button>
            <button
              onClick={() => trpc.app.openSoundsFolder.mutate()}
              className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-md transition-colors"
            >
              Open Sounds Folder
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Supports MP3, WAV, OGG, M4A, AAC, and FLAC formats.
          </p>
        </div>
      )}
    </div>
  )
}
