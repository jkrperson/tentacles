import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import { SHORTCUT_DEFS, resolveKeys, formatKeys, encodeEvent } from '../../../shortcuts'

export function KeybindingsSection() {
  const custom = useSettingsStore((s) => s.settings.customKeybindings ?? {})
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState<string | null>(null)
  const recordRef = useRef<HTMLDivElement>(null)

  const commitBinding = useCallback((actionId: string, keys: string) => {
    const def = SHORTCUT_DEFS.find((d) => d.id === actionId)
    const newCustom = { ...custom }
    // If user records the same as default, remove the custom override
    if (def && keys === def.defaultKeys) {
      delete newCustom[actionId]
    } else {
      newCustom[actionId] = keys
    }
    saveSettings({ customKeybindings: newCustom })
    setRecordingId(null)
    setRecordedKeys(null)
  }, [custom, saveSettings])

  const resetBinding = useCallback((actionId: string) => {
    const newCustom = { ...custom }
    delete newCustom[actionId]
    saveSettings({ customKeybindings: newCustom })
  }, [custom, saveSettings])

  const cancelRecording = useCallback(() => {
    setRecordingId(null)
    setRecordedKeys(null)
  }, [])

  // Listen for key recording
  useEffect(() => {
    if (!recordingId) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        cancelRecording()
        return
      }

      const encoded = encodeEvent(e)
      if (!encoded) return // only modifiers pressed
      setRecordedKeys(encoded)
      commitBinding(recordingId, encoded)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recordingId, commitBinding, cancelRecording])

  // Close recording on outside click
  useEffect(() => {
    if (!recordingId) return
    const handler = (e: MouseEvent) => {
      if (recordRef.current && !recordRef.current.contains(e.target as Node)) {
        cancelRecording()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [recordingId, cancelRecording])

  // Group by category
  const categories = new Map<string, typeof SHORTCUT_DEFS>()
  for (const def of SHORTCUT_DEFS) {
    const list = categories.get(def.category) ?? []
    list.push(def)
    categories.set(def.category, list)
  }

  return (
    <div className="space-y-5">
      {Array.from(categories.entries()).map(([category, defs]) => (
        <div key={category}>
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">{category}</h3>
          <div className="rounded-lg border border-[var(--t-border-input)] overflow-hidden">
            {defs.map((def, i) => {
              const keys = resolveKeys(def.id, custom)
              const isCustom = !!custom[def.id]
              const isRecording = recordingId === def.id

              return (
                <div
                  key={def.id}
                  ref={isRecording ? recordRef : undefined}
                  className={`flex items-center justify-between px-4 py-2.5 ${
                    i > 0 ? 'border-t border-[var(--t-border-input)]' : ''
                  } ${isRecording ? 'bg-[var(--t-accent)]/10' : ''}`}
                >
                  <span className="text-[13px] text-zinc-300">{def.label}</span>
                  <div className="flex items-center gap-2">
                    {isCustom && !isRecording && (
                      <button
                        onClick={() => resetBinding(def.id)}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Reset to default"
                      >
                        reset
                      </button>
                    )}
                    {isRecording ? (
                      <div className="flex items-center gap-2">
                        <kbd className="px-2 py-0.5 text-[11px] text-[var(--t-accent)] bg-[var(--t-accent)]/20 border border-[var(--t-accent)]/40 rounded font-mono min-w-[80px] text-center animate-pulse">
                          {recordedKeys ? formatKeys(recordedKeys) : 'Press keys...'}
                        </kbd>
                        <button
                          onClick={cancelRecording}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setRecordingId(def.id)
                          setRecordedKeys(null)
                        }}
                        className="group flex items-center gap-1.5"
                        title="Click to change shortcut"
                      >
                        <kbd className={`px-2 py-0.5 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded font-mono min-w-[28px] text-center group-hover:border-[var(--t-accent)]/50 transition-colors ${
                          isCustom ? 'text-[var(--t-accent)]' : 'text-zinc-400'
                        }`}>
                          {formatKeys(keys)}
                        </kbd>
                        <svg
                          width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                          className="text-zinc-700 group-hover:text-zinc-400 transition-colors"
                        >
                          <path d="M12.146.854a.5.5 0 0 1 .708 0l2.292 2.292a.5.5 0 0 1 0 .708l-9.146 9.146a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168L12.146.854zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
