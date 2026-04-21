import { useEffect, useRef } from 'react'
import { useVoiceCommandStore } from '../stores/voiceCommandStore'
import { useSettingsStore } from '../stores/settingsStore'
import { createStreamTranscriber, type StreamTranscriber } from '../utils/streamTranscriber'

/** Base silence threshold — scaled by micSensitivity setting */
const BASE_SILENCE_THRESHOLD = 0.01
/** How long silence must last after we have transcript content before auto-submitting (ms) */
const AUTO_SUBMIT_SILENCE_MS = 1200
/** Max time to wait for AWS to flush remaining finals after we signal end-of-stream (ms) */
const DRAIN_TIMEOUT_MS = 2500

/**
 * Voice command audio pipeline — streaming version.
 *
 * Opens an AWS Transcribe Streaming session via the backend and pumps PCM
 * directly to AWS. Partial transcripts flow into voiceCommandStore.partialTranscript
 * as they arrive; finalized segments accumulate into transcript. Silence after
 * any committed/partial content triggers auto-submit to the agent.
 */
export function useVoiceAudio() {
  const isOpen = useVoiceCommandStore((s) => s.isOpen)
  const phase = useVoiceCommandStore((s) => s.phase)
  const inputMode = useVoiceCommandStore((s) => s.inputMode)
  const appendTranscript = useVoiceCommandStore((s) => s.appendTranscript)
  const setPartialTranscript = useVoiceCommandStore((s) => s.setPartialTranscript)
  const setAudioLevel = useVoiceCommandStore((s) => s.setAudioLevel)

  const streamRef = useRef<MediaStream | null>(null)
  const controllerRef = useRef<StreamTranscriber | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Bumped on each start so stale async handlers can bail out. */
  const sessionIdRef = useRef(0)
  /** True while processing_audio finalize is in progress — VAD should pause. */
  const isFinalizingRef = useRef(false)

  const shouldCaptureAudio = isOpen && inputMode === 'voice' && (phase === 'listening' || phase === 'processing_audio')

  const cancelAutoSubmit = () => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
  }

  const scheduleAutoSubmit = () => {
    if (autoSubmitTimerRef.current) return
    autoSubmitTimerRef.current = setTimeout(() => {
      autoSubmitTimerRef.current = null
      const store = useVoiceCommandStore.getState()
      const hasContent = store.transcript.trim() || store.partialTranscript.trim()
      if (store.isOpen && store.phase === 'listening' && hasContent) {
        store.setPhase('processing_audio')
      }
    }, AUTO_SUBMIT_SILENCE_MS)
  }

  const teardown = () => {
    cancelAutoSubmit()
    if (controllerRef.current) {
      controllerRef.current.cancel()
      controllerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    silenceStartRef.current = null
    setAudioLevel(0)
    setPartialTranscript('')
  }

  useEffect(() => {
    if (!shouldCaptureAudio) {
      teardown()
      return
    }

    // Finalize path: stop the controller (flush + drain), promote any leftover
    // partial to final, then submit.
    if (phase === 'processing_audio') {
      if (isFinalizingRef.current) return
      isFinalizingRef.current = true

      const runFinalize = async () => {
        cancelAutoSubmit()
        const controller = controllerRef.current
        try {
          if (controller) {
            await controller.stop({ drainTimeoutMs: DRAIN_TIMEOUT_MS })
          }
        } catch (err) {
          console.warn('[voiceCommand] stream stop error:', err)
        }
        controllerRef.current = null
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }

        // Commit any unfinalized partial so the user's last utterance is submitted.
        const store = useVoiceCommandStore.getState()
        if (store.partialTranscript.trim()) {
          store.appendTranscript(store.partialTranscript.trim())
          store.setPartialTranscript('')
        }

        if (store.isOpen && store.transcript.trim()) {
          await store.submitTranscript()
        } else if (store.isOpen && store.phase === 'processing_audio' && store.inputMode === 'voice') {
          store.setPhase('listening')
        }
        isFinalizingRef.current = false
      }
      runFinalize()
      return
    }

    let cancelled = false
    const mySession = ++sessionIdRef.current

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
        const isOverconstrained = err instanceof DOMException && err.name === 'OverconstrainedError'
        if (micDeviceId && isOverconstrained) {
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

    void (async () => {
      let stream: MediaStream
      try {
        stream = await acquireMic()
      } catch (err) {
        console.error('[voiceCommand] microphone access denied:', err)
        useVoiceCommandStore.getState().setError('Microphone access denied')
        return
      }
      if (cancelled || sessionIdRef.current !== mySession) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream

      const controller = createStreamTranscriber({
        stream,
        onPartial: (text) => {
          if (sessionIdRef.current !== mySession) return
          setPartialTranscript(text)
        },
        onFinalDelta: (text) => {
          if (sessionIdRef.current !== mySession) return
          appendTranscript(text)
        },
        onError: (err) => {
          if (sessionIdRef.current !== mySession) return
          console.error('[voiceCommand] stream error:', err)
          useVoiceCommandStore.getState().setError(err.message)
        },
        onLevel: (rms) => {
          if (sessionIdRef.current !== mySession) return
          setAudioLevel(Math.min(1, rms * 10))

          // VAD-based auto-submit: sustained silence after we have any text content.
          const now = Date.now()
          const isSilent = rms < silenceThreshold
          if (!isSilent) {
            silenceStartRef.current = null
            cancelAutoSubmit()
            return
          }
          if (silenceStartRef.current === null) silenceStartRef.current = now
          const store = useVoiceCommandStore.getState()
          const hasContent = store.transcript.trim() || store.partialTranscript.trim()
          if (hasContent) scheduleAutoSubmit()
        },
        language: undefined,
      })
      controllerRef.current = controller

      try {
        await controller.start()
      } catch (err) {
        if (sessionIdRef.current !== mySession) return
        const msg = err instanceof Error ? err.message : 'Failed to start transcription'
        console.error('[voiceCommand] failed to start stream:', err)
        useVoiceCommandStore.getState().setError(msg)
        // Tear down the mic we acquired.
        if (streamRef.current === stream) {
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        controllerRef.current = null
        return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [shouldCaptureAudio, phase]) // eslint-disable-line react-hooks/exhaustive-deps
}
