import { useEffect, useRef } from 'react'
import { useVoiceCommandStore } from '../stores/voiceCommandStore'
import { useSettingsStore } from '../stores/settingsStore'
import { trpc } from '../trpc'

/** Base silence threshold — scaled by micSensitivity setting */
const BASE_SILENCE_THRESHOLD = 0.01
/** How long silence must last before we finalize a chunk (ms) */
const SILENCE_DURATION_MS = 450
/** Minimum speech duration before sending to server (ms) */
const MIN_CHUNK_DURATION_MS = 500
/** Maximum chunk length before force-sending (ms) */
const MAX_CHUNK_DURATION_MS = 10000
/** How often to check audio levels (ms) */
const VAD_CHECK_INTERVAL_MS = 50
/** Max concurrent transcription calls */
const MAX_CONCURRENT_SENDS = 3
/** How long silence must last after speech to auto-submit the transcript (ms) */
const AUTO_SUBMIT_SILENCE_MS = 1200
/** Max wait for VAD flush during finalize (ms) */
const FLUSH_WAIT_TIMEOUT_MS = 2000
/** Max wait for recorder stop during finalize (ms) */
const RECORDER_STOP_TIMEOUT_MS = 5000
/** Max wait for in-flight transcriptions to drain (ms) */
const DRAIN_TIMEOUT_MS = 15000

export function useVoiceAudio() {
  const isOpen = useVoiceCommandStore((s) => s.isOpen)
  const phase = useVoiceCommandStore((s) => s.phase)
  const inputMode = useVoiceCommandStore((s) => s.inputMode)
  const appendTranscript = useVoiceCommandStore((s) => s.appendTranscript)
  const setAudioLevel = useVoiceCommandStore((s) => s.setAudioLevel)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const chunkStartRef = useRef<number>(0)
  const hadSpeechRef = useRef(false)
  const activeSendsRef = useRef(0)
  const mimeTypeRef = useRef('audio/webm')
  const isStoppingRef = useRef(false)
  const sessionIdRef = useRef(0)
  // Track silence for auto-submit: we auto-submit when there's been sustained
  // silence (no speech detected by VAD) AND all transcriptions have returned
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set true once we have at least one transcript chunk
  const hasTranscriptRef = useRef(false)

  const shouldRecord = isOpen && phase === 'listening' && inputMode === 'voice'

  const flushAndRestart = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive' || isStoppingRef.current) return
    if (!hadSpeechRef.current) {
      chunksRef.current = []
      chunkStartRef.current = Date.now()
      hadSpeechRef.current = false
      return
    }
    if (activeSendsRef.current >= MAX_CONCURRENT_SENDS) return

    isStoppingRef.current = true

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
      chunksRef.current = []
      chunkStartRef.current = Date.now()
      hadSpeechRef.current = false
      isStoppingRef.current = false

      if (blob.size > 0) {
        transcribeBlob(blob)
      }

      // Restart recording on the same stream
      const stream = streamRef.current
      const store = useVoiceCommandStore.getState()
      if (stream && stream.active && store.isOpen && store.phase === 'listening' && store.inputMode === 'voice') {
        const newRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current })
        mediaRecorderRef.current = newRecorder
        newRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        newRecorder.start(500)
      }
    }

    recorder.stop()
  }

  const transcribeBlob = async (blob: Blob): Promise<boolean> => {
    activeSendsRef.current++
    const mySession = sessionIdRef.current

    try {
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const CHUNK_SIZE = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[])
      }
      const base64 = btoa(binary)
      if (!base64) return false

      const result = await trpc.dictation.transcribe.mutate({
        audio: base64,
        mimeType: mimeTypeRef.current,
      })
      if (sessionIdRef.current !== mySession) return false
      if (result.text) {
        appendTranscript(result.text)
        hasTranscriptRef.current = true
      }
      return true
    } catch (err) {
      console.error('[voiceCommand] transcription error:', err)
      return false
    } finally {
      activeSendsRef.current--
    }
  }

  /** Called from VAD when sustained silence detected and we have transcript content */
  const scheduleAutoSubmit = () => {
    if (autoSubmitTimerRef.current) return // already scheduled
    autoSubmitTimerRef.current = setTimeout(() => {
      autoSubmitTimerRef.current = null
      const store = useVoiceCommandStore.getState()
      if (store.isOpen && store.phase === 'listening' && store.transcript.trim()) {
        store.setPhase('processing_audio')
        finalizeAndSubmit()
      }
    }, AUTO_SUBMIT_SILENCE_MS)
  }

  const cancelAutoSubmit = () => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
  }

  const finalizeAndSubmit = async () => {
    // Wait for any in-progress flush
    await waitUntil(() => !isStoppingRef.current, FLUSH_WAIT_TIMEOUT_MS, 20)

    // Stop recorder and transcribe final chunk
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), RECORDER_STOP_TIMEOUT_MS)
        recorder.onstop = async () => {
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
            chunksRef.current = []
            if (blob.size > 0) {
              await transcribeBlob(blob)
            }
          }
          clearTimeout(timeout)
          resolve()
        }
        try { recorder.stop() } catch { clearTimeout(timeout); resolve() }
      })
    }

    // Drain in-flight transcriptions
    await waitUntil(() => activeSendsRef.current === 0, DRAIN_TIMEOUT_MS, 50)

    // Submit the transcript
    const store = useVoiceCommandStore.getState()
    if (store.isOpen && store.transcript.trim()) {
      store.submitTranscript()
    }
  }

  const waitUntil = async (predicate: () => boolean, timeoutMs: number, pollMs: number): Promise<boolean> => {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) return false
      await new Promise((r) => setTimeout(r, pollMs))
    }
    return true
  }

  const getRMSLevel = (): number => {
    const analyser = analyserRef.current
    if (!analyser) return 0
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i]
    }
    return Math.sqrt(sum / data.length)
  }

  const teardown = () => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      try { recorder.stop() } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }

  useEffect(() => {
    if (!shouldRecord) {
      teardown()
      return
    }

    let cancelled = false
    sessionIdRef.current++
    hasTranscriptRef.current = false

    const { micDeviceId, micSensitivity, noiseSuppression } = useSettingsStore.getState().settings.dictation
    const silenceThreshold = BASE_SILENCE_THRESHOLD * Math.pow(0.5, (micSensitivity - 5) / 2.5)
    const audioConstraints: MediaTrackConstraints = {
      deviceId: micDeviceId ? { ideal: micDeviceId } : undefined,
      noiseSuppression,
      echoCancellation: noiseSuppression,
      autoGainControl: true,
    }

    const acquireMic = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } catch (err) {
        if (micDeviceId && err instanceof OverconstrainedError) {
          return navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression: audioConstraints.noiseSuppression,
              echoCancellation: audioConstraints.echoCancellation,
              autoGainControl: audioConstraints.autoGainControl,
            },
          })
        }
        throw err
      }
    }

    acquireMic()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const audioContext = new AudioContext()
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        analyserRef.current = analyser

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        mimeTypeRef.current = mimeType

        const recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.start(250)
        chunkStartRef.current = Date.now()
        silenceStartRef.current = null
        hadSpeechRef.current = false
        isStoppingRef.current = false

        vadIntervalRef.current = setInterval(() => {
          if (isStoppingRef.current) return
          const rms = getRMSLevel()
          setAudioLevel(Math.min(1, rms * 10))
          const now = Date.now()
          const chunkAge = now - chunkStartRef.current
          const isSilent = rms < silenceThreshold

          if (!isSilent) {
            hadSpeechRef.current = true
            silenceStartRef.current = null
            // Speech resumed — cancel any pending auto-submit
            cancelAutoSubmit()
            return
          }

          if (silenceStartRef.current === null) {
            silenceStartRef.current = now
          }
          const silenceDuration = now - silenceStartRef.current

          if (hadSpeechRef.current && silenceDuration >= SILENCE_DURATION_MS && chunkAge >= MIN_CHUNK_DURATION_MS) {
            flushAndRestart()
            silenceStartRef.current = null
          }

          if (hadSpeechRef.current && chunkAge >= MAX_CHUNK_DURATION_MS) {
            flushAndRestart()
            silenceStartRef.current = null
          }

          // Auto-submit: if we have transcript content and sustained silence
          // (no speech for a while after recording), schedule submission
          if (hasTranscriptRef.current && silenceDuration >= SILENCE_DURATION_MS) {
            scheduleAutoSubmit()
          }
        }, VAD_CHECK_INTERVAL_MS)
      })
      .catch((err) => {
        console.error('[voiceCommand] microphone access denied:', err)
        useVoiceCommandStore.getState().setError('Microphone access denied')
      })

    return () => {
      cancelled = true
    }
  }, [shouldRecord]) // eslint-disable-line react-hooks/exhaustive-deps
}
