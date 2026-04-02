import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppSettings } from '../../../types'

interface DictationSectionProps {
  draft: AppSettings
  onUpdate: (updater: (d: AppSettings) => AppSettings) => void
}

interface AudioDevice {
  deviceId: string
  label: string
}

export function DictationSection({ draft, onUpdate }: DictationSectionProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [testLevel, setTestLevel] = useState(0)
  const testStreamRef = useRef<MediaStream | null>(null)
  const testContextRef = useRef<AudioContext | null>(null)
  const testIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load available audio input devices
  useEffect(() => {
    async function loadDevices() {
      try {
        // Need a brief permission grant to get labeled devices
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        tempStream.getTracks().forEach((t) => t.stop())

        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = allDevices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }))
        setDevices(audioInputs)
      } catch {
        // If mic access denied, leave list empty
      }
    }
    loadDevices()
  }, [])

  const stopTest = useCallback(() => {
    if (testIntervalRef.current) {
      clearInterval(testIntervalRef.current)
      testIntervalRef.current = null
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop())
      testStreamRef.current = null
    }
    if (testContextRef.current) {
      testContextRef.current.close()
      testContextRef.current = null
    }
    setIsTestingMic(false)
    setTestLevel(0)
  }, [])

  const startTest = useCallback(async () => {
    stopTest()

    try {
      const constraints: MediaTrackConstraints = {
        deviceId: draft.dictation.micDeviceId ? { ideal: draft.dictation.micDeviceId } : undefined,
        noiseSuppression: draft.dictation.noiseSuppression,
        echoCancellation: draft.dictation.noiseSuppression,
        autoGainControl: true,
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
      testStreamRef.current = stream

      const ctx = new AudioContext()
      testContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      // Route mic audio to speakers for playback
      source.connect(ctx.destination)

      setIsTestingMic(true)

      testIntervalRef.current = setInterval(() => {
        const data = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i]
        }
        const rms = Math.sqrt(sum / data.length)
        setTestLevel(Math.min(1, rms * 10))
      }, 50)

      // Auto-stop after 10 seconds
      setTimeout(() => stopTest(), 10000)
    } catch {
      stopTest()
    }
  }, [draft.dictation.micDeviceId, draft.dictation.noiseSuppression, stopTest])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTest()
  }, [stopTest])

  const updateDictation = (updates: Partial<AppSettings['dictation']>) => {
    onUpdate((d) => ({ ...d, dictation: { ...d.dictation, ...updates } }))
  }

  return (
    <div className="space-y-6">
      {/* Microphone Selection */}
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Microphone</label>
        <select
          value={draft.dictation.micDeviceId}
          onChange={(e) => updateDictation({ micDeviceId: e.target.value })}
          className="w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded-md px-2.5 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/50 transition-colors appearance-none pr-7 cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          <option value="">System Default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Mic Sensitivity */}
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Mic Sensitivity</label>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500 w-6">Low</span>
          <input
            type="range"
            min={1}
            max={10}
            value={draft.dictation.micSensitivity}
            onChange={(e) => updateDictation({ micSensitivity: parseInt(e.target.value) || 5 })}
            className="flex-1 accent-[var(--t-accent)]"
          />
          <span className="text-[11px] text-zinc-500 w-7">High</span>
          <span className="text-[13px] text-zinc-300 w-5 text-right">{draft.dictation.micSensitivity}</span>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Higher values pick up quieter speech. Lower values ignore more background noise.
        </p>
      </div>

      {/* Noise Suppression */}
      <div className="flex items-center justify-between py-2">
        <div>
          <span className="text-[13px] text-zinc-300">Noise Suppression</span>
          <p className="text-[11px] text-zinc-500 mt-0.5">Enable browser-level noise suppression and echo cancellation.</p>
        </div>
        <button
          onClick={() => updateDictation({ noiseSuppression: !draft.dictation.noiseSuppression })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            draft.dictation.noiseSuppression ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              draft.dictation.noiseSuppression ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      {/* Mic Test / Playback */}
      <div>
        <label className="block text-[13px] text-zinc-300 mb-2">Microphone Test</label>
        <div className="flex items-center gap-3">
          <button
            onClick={isTestingMic ? stopTest : startTest}
            className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
              isTestingMic
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : 'border border-[var(--t-border-input)] text-zinc-400 hover:text-zinc-200 hover:border-[var(--t-border-input-hover)]'
            }`}
          >
            {isTestingMic ? 'Stop Test' : 'Test Microphone'}
          </button>
          {isTestingMic && (
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-2 bg-[var(--t-bg-base)] rounded-full overflow-hidden border border-[var(--t-border-input)]">
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{
                    width: `${testLevel * 100}%`,
                    backgroundColor: testLevel > 0.7 ? '#ef4444' : testLevel > 0.3 ? '#eab308' : 'var(--t-accent)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Speak to see how your mic picks up audio with current settings. Stops after 10 seconds.
        </p>
      </div>

      {/* Auto-insert */}
      <div className="flex items-center justify-between py-2">
        <div>
          <span className="text-[13px] text-zinc-300">Auto-insert into agent</span>
          <p className="text-[11px] text-zinc-500 mt-0.5">Automatically type the transcribed text into the active session.</p>
        </div>
        <button
          onClick={() => updateDictation({ autoInsert: !draft.dictation.autoInsert })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            draft.dictation.autoInsert ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-input)]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              draft.dictation.autoInsert ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
