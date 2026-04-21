import { useEffect, useRef } from 'react'
import { useDictationStore } from '../stores/dictationStore'
import { useSettingsStore } from '../stores/settingsStore'
import { createStreamTranscriber, type StreamTranscriber } from '../utils/streamTranscriber'

/** Max time to wait for AWS to flush remaining finals after we signal end-of-stream (ms) */
const DRAIN_TIMEOUT_MS = 4000

/**
 * Dictation audio pipeline — streaming version.
 *
 * Opens an AWS Transcribe Streaming session via the backend and pumps PCM
 * directly to AWS. Partial transcripts flow into dictationStore.partialTranscript
 * as they arrive; finalized segments accumulate into rawTranscript. When the
 * user presses Finish, we drain the stream, commit any leftover partial, then
 * run the cleanup pass and insert the result into the active agent.
 */
export function useDictation() {
  const phase = useDictationStore((s) => s.phase)
  const appendTranscript = useDictationStore((s) => s.appendTranscript)
  const setPartialTranscript = useDictationStore((s) => s.setPartialTranscript)
  const setAudioLevel = useDictationStore((s) => s.setAudioLevel)
  const cancel = useDictationStore((s) => s.cancel)

  const streamRef = useRef<MediaStream | null>(null)
  const controllerRef = useRef<StreamTranscriber | null>(null)
  /** Bumped each time a new recording starts — stale async handlers check this and bail. */
  const sessionIdRef = useRef(0)
  const isFinalizingRef = useRef(false)

  useEffect(() => {
    if (phase !== 'recording') {
      const teardownAudioGraph = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        setAudioLevel(0)
      }

      if (phase === 'idle') {
        // Cancelled — discard in-flight audio and tear down immediately.
        if (controllerRef.current) {
          controllerRef.current.cancel()
          controllerRef.current = null
        }
        setPartialTranscript('')
        teardownAudioGraph()
        return
      }

      // phase === 'processing' — user pressed Finish.
      if (isFinalizingRef.current) return
      isFinalizingRef.current = true

      let cancelledFinalize = false
      const finalize = async () => {
        const controller = controllerRef.current
        try {
          if (controller) {
            await controller.stop({ drainTimeoutMs: DRAIN_TIMEOUT_MS })
          }
        } catch (err) {
          console.warn('[dictation] stream stop error:', err)
          useDictationStore.setState({ error: err instanceof Error ? err.message : 'Stream stop error' })
        }
        if (cancelledFinalize) { isFinalizingRef.current = false; return }
        controllerRef.current = null

        // Commit any partial that didn't get finalized in time so we don't lose the user's last utterance.
        const store = useDictationStore.getState()
        if (store.partialTranscript.trim()) {
          store.appendTranscript(store.partialTranscript.trim())
          store.setPartialTranscript('')
        }

        teardownAudioGraph()

        if (useDictationStore.getState().phase === 'processing') {
          useDictationStore.getState().finalizeAfterRecording()
        }
        isFinalizingRef.current = false
      }
      finalize()
      return () => {
        cancelledFinalize = true
      }
    }

    let cancelled = false
    const mySession = ++sessionIdRef.current

    const { micDeviceId, noiseSuppression } = useSettingsStore.getState().settings.dictation
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

    void (async () => {
      let stream: MediaStream
      try {
        stream = await acquireMic()
      } catch (err) {
        console.error('[dictation] microphone access denied:', err)
        cancel()
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
          console.error('[dictation] stream error:', err)
          useDictationStore.setState({ error: err.message })
          // Preserve any partial work by moving straight into processing so cleanup
          // runs on whatever text we have. If there's nothing, finalize bumps to idle.
          if (useDictationStore.getState().phase === 'recording') {
            useDictationStore.setState({ phase: 'processing' })
          }
        },
        onLevel: (rms) => {
          if (sessionIdRef.current !== mySession) return
          setAudioLevel(Math.min(1, rms * 10))
        },
        language: undefined,
      })
      controllerRef.current = controller

      try {
        await controller.start()
      } catch (err) {
        if (sessionIdRef.current !== mySession) return
        const msg = err instanceof Error ? err.message : 'Failed to start transcription'
        console.error('[dictation] failed to start stream:', err)
        useDictationStore.setState({ error: msg })
        if (streamRef.current === stream) {
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        controllerRef.current = null
        // Surface error and bail to idle so the user can retry.
        useDictationStore.getState().cancel()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
}
