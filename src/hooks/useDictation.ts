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

  const transcribeBlob = async (blob: Blob) => {
    activeSendsRef.current++

    try {
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const CHUNK_SIZE = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[])
      }
      const base64 = btoa(binary)
      if (!base64) return

      const result = await trpc.dictation.transcribe.mutate({
        audio: base64,
        mimeType: mimeTypeRef.current,
      })
      if (result.text) {
        appendTranscript(result.text)
      }
    } catch (err) {
      console.error('[dictation] transcription error:', err)
    } finally {
      activeSendsRef.current--
    }
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
      // Stop recorder and send any remaining audio — user explicitly pressed Stop,
      // so always send regardless of VAD state
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const recorder = mediaRecorderRef.current
        recorder.onstop = () => {
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
            chunksRef.current = []
            if (blob.size > 0) transcribeBlob(blob)
          }
        }
        recorder.stop()
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
      return
    }

    let cancelled = false

    const { micDeviceId, micSensitivity, noiseSuppression } = useSettingsStore.getState().settings.dictation
    // micSensitivity 1–10: higher = more sensitive (lower threshold)
    // At 5 (default), threshold = BASE (0.01). At 10, threshold = 0.002. At 1, threshold = 0.05.
    const silenceThreshold = BASE_SILENCE_THRESHOLD * Math.pow(0.5, (micSensitivity - 5) / 2.5)
    // noiseSuppression 1–10: controls browser-level noise suppression
    const useNoiseSuppression = noiseSuppression >= 5

    const audioConstraints: MediaTrackConstraints = {
      deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
      noiseSuppression: useNoiseSuppression,
      echoCancellation: useNoiseSuppression,
      autoGainControl: true,
    }

    navigator.mediaDevices
      .getUserMedia({ audio: audioConstraints })
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
