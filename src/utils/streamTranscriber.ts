/**
 * Streaming transcription controller.
 *
 * Bridges a MediaStream (from getUserMedia) to AWS Transcribe Streaming via a
 * server-minted presigned WebSocket URL. Emits partial + final transcript
 * updates, handles end-of-stream draining, and reports usage to the server
 * for billing.
 *
 * Lifecycle:
 *   const ctl = createStreamTranscriber({ stream, onPartial, onFinalDelta, onError })
 *   await ctl.start()
 *   // ... audio flows, callbacks fire ...
 *   await ctl.stop()   // graceful: sends end-of-stream, drains, reports usage
 *   // or
 *   ctl.cancel()       // immediate teardown, still reports usage for audio already sent
 *
 * The controller never stops the MediaStream's tracks — the caller owns the
 * mic. This lets the caller reuse the same mic across multiple utterances if
 * they want, though the current UX always acquires fresh.
 */

import { trpc } from '../trpc'
import { startPcmCapture, type PcmCaptureHandle } from './pcmCapture'
import {
  EventStreamDecoder,
  encodeAudioEvent,
  encodeEndOfStream,
  parseTranscribeEvent,
} from './awsEventStream'

/** Max PCM bytes to buffer while waiting for the WebSocket to open. */
const MAX_PRE_OPEN_BUFFER_BYTES = 1024 * 1024 // 1 MB ≈ 32s of 16kHz int16 audio

/** How long to wait after end-of-stream for AWS to flush final results. */
const DEFAULT_DRAIN_TIMEOUT_MS = 3000

/** Close codes. 1000 = normal closure. */
const WS_CLOSE_NORMAL = 1000

export interface StreamTranscriberOptions {
  /** Live mic stream. Controller reads from this but does not stop its tracks. */
  stream: MediaStream
  /** Language hint passed to the server when creating the session. */
  language?: string
  /** Invoked whenever the in-progress partial segment text changes. '' clears. */
  onPartial: (text: string) => void
  /** Invoked with each newly finalized segment. Caller appends to its committed transcript. */
  onFinalDelta: (text: string) => void
  /** Fatal errors: mic failure, WS error, AWS exception. The controller has already torn down when this fires. */
  onError: (err: Error) => void
  /** Optional: invoked once the WebSocket reports readyState=OPEN and audio is flowing. */
  onOpen?: () => void
  /** Optional RMS level callback for VAD / meter display. Polled at ~20Hz. */
  onLevel?: (rms: number) => void
}

export interface StreamTranscriber {
  /** Start the pipeline. Resolves once the session is created and PCM capture is running. WS may still be connecting. */
  start: () => Promise<void>
  /** Graceful stop: send end-of-stream, wait for finals, close, report usage. */
  stop: (opts?: { drainTimeoutMs?: number }) => Promise<void>
  /** Immediate teardown. Reports usage based on elapsed time. */
  cancel: () => void
  /** True once start() has been called and not yet stopped/cancelled. */
  readonly isRunning: boolean
}

export function createStreamTranscriber(options: StreamTranscriberOptions): StreamTranscriber {
  const state: {
    running: boolean
    stopping: boolean
    capture: PcmCaptureHandle | null
    ws: WebSocket | null
    decoder: EventStreamDecoder
    sessionId: string | null
    startedAtMs: number | null
    startedAtIso: string | null
    levelTimer: ReturnType<typeof setInterval> | null
    // Audio queued while WS is still connecting.
    preOpenQueue: Uint8Array[]
    preOpenBytes: number
    finalText: string
    partialResultId: string | null
    partialText: string
    // Resolves when the WS closes normally during stop().
    closePromise: Promise<void> | null
    closeResolve: (() => void) | null
    teardownDone: boolean
    errorFired: boolean
  } = {
    running: false,
    stopping: false,
    capture: null,
    ws: null,
    decoder: new EventStreamDecoder(),
    sessionId: null,
    startedAtMs: null,
    startedAtIso: null,
    levelTimer: null,
    preOpenQueue: [],
    preOpenBytes: 0,
    finalText: '',
    partialResultId: null,
    partialText: '',
    closePromise: null,
    closeResolve: null,
    teardownDone: false,
    errorFired: false,
  }

  const fireError = (err: Error): void => {
    if (state.errorFired) return
    state.errorFired = true
    teardown()
    options.onError(err)
  }

  const teardown = (): void => {
    if (state.teardownDone) return
    state.teardownDone = true
    state.running = false

    if (state.levelTimer) {
      clearInterval(state.levelTimer)
      state.levelTimer = null
    }
    if (state.capture) {
      void state.capture.stop()
      state.capture = null
    }
    if (state.ws) {
      try {
        if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
          state.ws.close(WS_CLOSE_NORMAL)
        }
      } catch { /* ignore */ }
      state.ws = null
    }
    state.preOpenQueue = []
    state.preOpenBytes = 0
  }

  const reportUsage = (): void => {
    if (!state.sessionId || !state.startedAtIso || !state.startedAtMs) return
    const endedAtMs = Date.now()
    const audioSeconds = Math.max(0, (endedAtMs - state.startedAtMs) / 1000)
    // Server rejects 0 seconds. Skip if we never got audio flowing.
    if (audioSeconds < 0.1) return
    const endedAtIso = new Date(endedAtMs).toISOString()
    const sessionId = state.sessionId
    const startedAtIso = state.startedAtIso
    // Fire and forget — we don't want billing hiccups to surface as transcription errors.
    trpc.dictation.reportStreamUsage.mutate({
      sessionId,
      audioSeconds,
      startedAt: startedAtIso,
      endedAt: endedAtIso,
    }).catch((err) => {
      console.warn('[streamTranscriber] failed to report usage:', err)
    })
  }

  const handleTranscriptResults = (results: Array<{ ResultId?: string; IsPartial?: boolean; Alternatives?: Array<{ Transcript?: string }> }>): void => {
    for (const result of results) {
      const text = result.Alternatives?.[0]?.Transcript?.trim() ?? ''
      const resultId = result.ResultId
      if (!resultId) continue

      if (result.IsPartial === false) {
        if (text) {
          state.finalText = state.finalText + (state.finalText ? ' ' : '') + text
          options.onFinalDelta(text)
        }
        if (state.partialResultId === resultId) {
          state.partialResultId = null
          state.partialText = ''
          options.onPartial('')
        }
      } else {
        state.partialResultId = resultId
        state.partialText = text
        options.onPartial(text)
      }
    }
  }

  const sendAudioFrame = (pcm: Uint8Array): void => {
    const ws = state.ws
    if (!ws) return
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(encodeAudioEvent(pcm))
      } catch (err) {
        fireError(err instanceof Error ? err : new Error(String(err)))
      }
      return
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      // Buffer up to a hard cap to avoid unbounded memory growth if the WS never opens.
      if (state.preOpenBytes + pcm.length > MAX_PRE_OPEN_BUFFER_BYTES) return
      state.preOpenQueue.push(pcm)
      state.preOpenBytes += pcm.length
    }
  }

  const drainPreOpenQueue = (): void => {
    const ws = state.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const chunk of state.preOpenQueue) {
      try {
        ws.send(encodeAudioEvent(chunk))
      } catch (err) {
        fireError(err instanceof Error ? err : new Error(String(err)))
        return
      }
    }
    state.preOpenQueue = []
    state.preOpenBytes = 0
  }

  const getRms = (): number => {
    const analyser = state.capture?.analyser
    if (!analyser) return 0
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    return Math.sqrt(sum / data.length)
  }

  const start = async (): Promise<void> => {
    if (state.running) throw new Error('Stream transcriber already running')
    state.running = true

    let session: { sessionId: string; streamUrl: string; sampleRate: number }
    try {
      session = await trpc.dictation.streamSession.mutate({
        language: options.language,
      })
    } catch (err) {
      state.running = false
      throw err instanceof Error ? err : new Error(String(err))
    }

    state.sessionId = session.sessionId

    let capture: PcmCaptureHandle
    try {
      capture = await startPcmCapture({
        stream: options.stream,
        sampleRate: session.sampleRate,
        onPcm: (pcm) => {
          // Mark start-of-audio on the first non-silent frame. We use the
          // first PCM frame unconditionally because VAD has already gated
          // whether we even started at this level.
          if (state.startedAtMs === null) {
            state.startedAtMs = Date.now()
            state.startedAtIso = new Date(state.startedAtMs).toISOString()
          }
          sendAudioFrame(pcm)
        },
        onError: (err) => {
          fireError(err instanceof Error ? err : new Error(String(err)))
        },
      })
    } catch (err) {
      state.running = false
      state.sessionId = null
      throw err instanceof Error ? err : new Error(String(err))
    }
    state.capture = capture

    if (options.onLevel) {
      state.levelTimer = setInterval(() => {
        try { options.onLevel?.(getRms()) } catch { /* ignore */ }
      }, 50)
    }

    const ws = new WebSocket(session.streamUrl)
    ws.binaryType = 'arraybuffer'
    state.ws = ws

    ws.onopen = () => {
      drainPreOpenQueue()
      options.onOpen?.()
    }

    ws.onmessage = (ev: MessageEvent<ArrayBuffer | Blob | string>) => {
      // Transcribe always sends binary frames. Other types would be a protocol violation.
      if (!(ev.data instanceof ArrayBuffer)) {
        console.warn('[streamTranscriber] ignoring non-binary WS frame')
        return
      }
      let messages
      try {
        messages = state.decoder.push(new Uint8Array(ev.data))
      } catch (err) {
        fireError(err instanceof Error ? err : new Error(String(err)))
        return
      }
      for (const msg of messages) {
        const parsed = parseTranscribeEvent(msg)
        if (parsed.kind === 'transcript') {
          handleTranscriptResults(parsed.results)
        } else if (parsed.kind === 'exception') {
          fireError(new Error(`${parsed.code}: ${parsed.message}`))
          return
        }
        // unknown: ignore
      }
    }

    ws.onerror = () => {
      // The browser doesn't expose details for WS errors. onclose fires next with a code.
      // We only surface an error if we weren't already in the middle of a graceful stop.
      if (!state.stopping) {
        fireError(new Error('WebSocket connection error'))
      }
    }

    ws.onclose = (ev) => {
      if (state.closeResolve) {
        state.closeResolve()
        state.closeResolve = null
      }
      if (!state.stopping && state.running && !state.errorFired) {
        fireError(new Error(`WebSocket closed unexpectedly (code ${ev.code})`))
      }
    }
  }

  const stop = async (opts?: { drainTimeoutMs?: number }): Promise<void> => {
    if (!state.running || state.stopping) return
    state.stopping = true
    const drainTimeout = opts?.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS

    // Stop capture first so no more audio frames get queued.
    if (state.capture) {
      try { await state.capture.stop() } catch { /* ignore */ }
      state.capture = null
    }
    if (state.levelTimer) {
      clearInterval(state.levelTimer)
      state.levelTimer = null
    }

    const ws = state.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(encodeEndOfStream())
      } catch (err) {
        console.warn('[streamTranscriber] failed to send end-of-stream:', err)
      }

      // Wait for AWS to flush any remaining finals + close the connection.
      state.closePromise = new Promise<void>((resolve) => {
        state.closeResolve = resolve
      })
      await Promise.race([
        state.closePromise,
        new Promise<void>((resolve) => setTimeout(resolve, drainTimeout)),
      ])
    }

    reportUsage()
    teardown()
  }

  const cancel = (): void => {
    if (!state.running) {
      teardown()
      return
    }
    state.stopping = true
    reportUsage()
    teardown()
  }

  return {
    start,
    stop,
    cancel,
    get isRunning() { return state.running && !state.stopping },
  }
}
