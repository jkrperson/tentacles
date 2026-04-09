import { useEffect, useRef } from 'react'
import { useDictationStore } from '../stores/dictationStore'
import { useSettingsStore } from '../stores/settingsStore'
import { trpc } from '../trpc'

/** Base silence threshold — scaled by micSensitivity setting */
const BASE_SILENCE_THRESHOLD = 0.01
/** How long silence must last before we send a chunk (ms) */
const SILENCE_DURATION_MS = 700
/** Minimum speech duration before sending to server (ms) */
const MIN_CHUNK_DURATION_MS = 1000
/** Maximum chunk length before force-sending (ms) */
const MAX_CHUNK_DURATION_MS = 10000
/** How often to check audio levels (ms) */
const VAD_CHECK_INTERVAL_MS = 50
/** Max concurrent transcription calls */
const MAX_CONCURRENT_SENDS = 3
/** Max wait for an in-progress VAD flush/restart to complete during finalize (ms) */
const FLUSH_WAIT_TIMEOUT_MS = 2000
/** Max wait for the final recorder.stop() → onstop cycle during finalize (ms) */
const RECORDER_STOP_TIMEOUT_MS = 5000
/** Max wait for in-flight transcription calls to drain during finalize (ms) */
const DRAIN_TIMEOUT_MS = 15000

export function useDictation() {
  const phase = useDictationStore((s) => s.phase)
  const appendTranscript = useDictationStore((s) => s.appendTranscript)
  const setAudioLevel = useDictationStore((s) => s.setAudioLevel)
  const cancel = useDictationStore((s) => s.cancel)

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
  /** Bumped each time a new recording session starts — late transcriptions
   *  from a prior session are dropped by comparing against this. */
  const sessionIdRef = useRef(0)

  /**
   * Stop the recorder to finalize the WebM container (flush + close),
   * then immediately restart on the same stream for the next utterance.
   * Each stop/start cycle produces a valid standalone WebM file with a proper EBML header.
   */
  const flushAndRestart = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive' || isStoppingRef.current) return
    if (!hadSpeechRef.current) {
      // No speech detected — discard and reset without stopping
      chunksRef.current = []
      chunkStartRef.current = Date.now()
      hadSpeechRef.current = false
      return
    }
    if (activeSendsRef.current >= MAX_CONCURRENT_SENDS) return

    isStoppingRef.current = true
    console.log('[dictation] stopping recorder for flush, chunks so far:', chunksRef.current.length)

    // onstop fires after the final ondataavailable, so all data is in chunksRef
    recorder.onstop = () => {
      console.log('[dictation] recorder stopped, chunks:', chunksRef.current.length)
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
      chunksRef.current = []
      chunkStartRef.current = Date.now()
      hadSpeechRef.current = false
      isStoppingRef.current = false

      if (blob.size > 0) {
        console.log('[dictation] sending blob:', blob.size, 'bytes')
        transcribeBlob(blob)
      }

      // Restart recording on the same stream
      const stream = streamRef.current
      if (stream && stream.active && useDictationStore.getState().phase === 'recording') {
        const newRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current })
        mediaRecorderRef.current = newRecorder
        newRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        newRecorder.start(500) // timeslice so data accumulates during recording
        console.log('[dictation] recorder restarted')
      }
    }

    recorder.stop()
  }

  const transcribeBlob = async (blob: Blob): Promise<boolean> => {
    activeSendsRef.current++
    // Capture the session at call time so late results from a prior
    // session (e.g. after cancel → restart) don't pollute the new transcript.
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
      if (sessionIdRef.current !== mySession) {
        console.log('[dictation] dropping stale transcription from prior session')
        return false
      }
      if (result.text) {
        appendTranscript(result.text)
      }
      return true
    } catch (err) {
      console.error('[dictation] transcription error:', err)
      return false
    } finally {
      activeSendsRef.current--
    }
  }

  /** Poll until predicate returns true or timeout/cancel. Returns true if satisfied in time. */
  const waitUntil = async (
    predicate: () => boolean,
    timeoutMs: number,
    pollMs: number,
    isCancelled: () => boolean,
  ): Promise<boolean> => {
    const start = Date.now()
    while (!predicate()) {
      if (isCancelled()) return false
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

  useEffect(() => {
    if (phase !== 'recording') {
      const teardown = () => {
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
      }

      if (phase === 'idle') {
        // Cancelled — discard in-flight audio and tear down immediately
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = null
          try { recorder.stop() } catch { /* ignore */ }
        }
        chunksRef.current = []
        teardown()
        return
      }

      // phase === 'processing' — user pressed Finish.
      // Wait for any in-progress VAD flush, then stop the current recorder,
      // await the final transcription, drain any other in-flight sends,
      // then trigger cleanup. Every wait has a timeout so the UI can't
      // get stuck in 'processing' forever.
      let cancelledFinalize = false
      const isCancelled = () => cancelledFinalize
      const finalize = async () => {
        // 1. Wait for any in-progress VAD-triggered flush/restart to complete
        const flushOk = await waitUntil(
          () => !isStoppingRef.current,
          FLUSH_WAIT_TIMEOUT_MS,
          20,
          isCancelled,
        )
        if (cancelledFinalize) return
        if (!flushOk) {
          console.warn('[dictation] finalize: VAD flush wait timed out — proceeding anyway')
        }

        // 2. Stop the current recorder and await the final transcription
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
          console.log('[dictation] finalize: stopping recorder for final blob')
          const stopResult = await Promise.race<'stopped' | 'timeout'>([
            new Promise<'stopped'>((resolve) => {
              recorder.onstop = async () => {
                if (chunksRef.current.length > 0) {
                  const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
                  chunksRef.current = []
                  if (blob.size > 0) {
                    console.log('[dictation] finalize: transcribing final blob:', blob.size, 'bytes')
                    const ok = await transcribeBlob(blob)
                    if (!ok) {
                      useDictationStore.setState({ error: 'Failed to transcribe final audio chunk' })
                    }
                  }
                }
                resolve('stopped')
              }
              try { recorder.stop() } catch { resolve('stopped') }
            }),
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), RECORDER_STOP_TIMEOUT_MS)),
          ])
          if (stopResult === 'timeout') {
            console.warn('[dictation] finalize: recorder stop timed out — proceeding with partial transcript')
            useDictationStore.setState({ error: 'Recording finalize timed out' })
          }
        }
        if (cancelledFinalize) return

        // 3. Drain any other in-flight transcription calls from earlier VAD flushes
        const drainOk = await waitUntil(
          () => activeSendsRef.current === 0,
          DRAIN_TIMEOUT_MS,
          50,
          isCancelled,
        )
        if (cancelledFinalize) return
        if (!drainOk) {
          console.warn('[dictation] finalize: drain timed out with', activeSendsRef.current, 'still in flight')
          useDictationStore.setState({ error: 'Some audio chunks failed to transcribe in time' })
        }

        teardown()

        // Only run cleanup if we're still in the processing phase
        // (user may have cancelled during finalize)
        if (useDictationStore.getState().phase === 'processing') {
          useDictationStore.getState().finalizeAfterRecording()
        }
      }

      finalize()
      return () => {
        cancelledFinalize = true
      }
    }

    let cancelled = false
    // New recording session — bump so any lingering late transcriptions
    // from a previous session get dropped.
    sessionIdRef.current++

    const { micDeviceId, micSensitivity, noiseSuppression } = useSettingsStore.getState().settings.dictation
    // micSensitivity 1–10: higher = more sensitive (lower threshold)
    // At 5 (default), threshold = BASE (0.01). At 10, threshold = 0.002. At 1, threshold = 0.05.
    const silenceThreshold = BASE_SILENCE_THRESHOLD * Math.pow(0.5, (micSensitivity - 5) / 2.5)
    const audioConstraints: MediaTrackConstraints = {
      deviceId: micDeviceId ? { ideal: micDeviceId } : undefined,
      noiseSuppression: noiseSuppression,
      echoCancellation: noiseSuppression,
      autoGainControl: true,
    }

    const acquireMic = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } catch (err) {
        // If the preferred device is unavailable, fall back to default mic
        if (micDeviceId && err instanceof OverconstrainedError) {
          console.warn('[dictation] preferred mic unavailable, falling back to default')
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

        console.log('[dictation] started recording, silenceThreshold:', silenceThreshold, 'micSensitivity:', micSensitivity)
        recorder.start(500) // 500ms timeslice so chunks accumulate for VAD to check
        chunkStartRef.current = Date.now()
        silenceStartRef.current = null
        hadSpeechRef.current = false
        isStoppingRef.current = false

        vadIntervalRef.current = setInterval(() => {
          if (isStoppingRef.current) return
          const rms = getRMSLevel()
          setAudioLevel(Math.min(1, rms * 10)) // normalize to 0–1 range
          const now = Date.now()
          const chunkAge = now - chunkStartRef.current
          const isSilent = rms < silenceThreshold

          if (!isSilent) {
            hadSpeechRef.current = true
            silenceStartRef.current = null
            return
          }

          // Silent
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now
          }
          const silenceDuration = now - silenceStartRef.current

          // Speech then silence → stop recorder to get a complete file, then restart
          if (hadSpeechRef.current && silenceDuration >= SILENCE_DURATION_MS && chunkAge >= MIN_CHUNK_DURATION_MS) {
            flushAndRestart()
            silenceStartRef.current = null
          }

          // Force-send long chunks
          if (hadSpeechRef.current && chunkAge >= MAX_CHUNK_DURATION_MS) {
            flushAndRestart()
            silenceStartRef.current = null
          }
        }, VAD_CHECK_INTERVAL_MS)
      })
      .catch((err) => {
        console.error('[dictation] microphone access denied:', err)
        cancel()
      })

    return () => {
      cancelled = true
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
}
