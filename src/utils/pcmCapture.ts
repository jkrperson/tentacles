/**
 * PCM capture pipeline for AWS Transcribe Streaming.
 *
 * Takes a MediaStream (from getUserMedia), runs it through an AudioContext at
 * the target sample rate (Chromium resamples automatically), and emits
 * little-endian int16 PCM chunks via the onPcm callback.
 *
 * Also exposes an AnalyserNode on the same graph so callers can compute RMS
 * for VAD / meter without running a second audio pipeline.
 *
 * The AudioWorklet processor is shipped inline as a blob URL — this avoids
 * needing any build-system hookups for a separate worklet file.
 */

const WORKLET_NAME = 'pcm-batcher'

// Runs inside AudioWorkletGlobalScope. Kept deliberately minimal: accumulate
// samples in a Float32 buffer, flush in fixed-size chunks as int16 LE. Flushing
// in ~100ms batches (at 16kHz → 1600 samples) keeps the message rate low and
// matches AWS Transcribe's recommended 125ms–1s chunk window.
const WORKLET_SOURCE = `
class PCMBatcherProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = options && options.processorOptions ? options.processorOptions : {}
    this.batchSize = Math.max(128, opts.batchSize | 0 || 1600)
    this.buffer = new Float32Array(this.batchSize)
    this.filled = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel) return true

    let readIdx = 0
    while (readIdx < channel.length) {
      const space = this.batchSize - this.filled
      const toCopy = Math.min(space, channel.length - readIdx)
      for (let i = 0; i < toCopy; i++) {
        this.buffer[this.filled + i] = channel[readIdx + i]
      }
      this.filled += toCopy
      readIdx += toCopy

      if (this.filled === this.batchSize) {
        const out = new Int16Array(this.batchSize)
        for (let i = 0; i < this.batchSize; i++) {
          let s = this.buffer[i]
          if (s > 1) s = 1
          else if (s < -1) s = -1
          out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF)
        }
        // Transfer the buffer to avoid copy overhead across the thread boundary.
        this.port.postMessage(out.buffer, [out.buffer])
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor(${JSON.stringify(WORKLET_NAME)}, PCMBatcherProcessor)
`

let cachedWorkletUrl: string | null = null

function getWorkletUrl(): string {
  if (cachedWorkletUrl) return cachedWorkletUrl
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
  cachedWorkletUrl = URL.createObjectURL(blob)
  return cachedWorkletUrl
}

export interface PcmCaptureOptions {
  /** Media stream from getUserMedia. Callers own the lifecycle of this stream. */
  stream: MediaStream
  /** Target sample rate for Transcribe. Default 16000. */
  sampleRate?: number
  /** Frame size in samples at target rate. Default 1600 (=100ms at 16kHz). */
  batchSize?: number
  /** Called with each int16 LE PCM batch. Receives a fresh Uint8Array (view over a detached buffer). */
  onPcm: (pcm: Uint8Array) => void
  /** Called if the audio pipeline errors out. */
  onError?: (err: unknown) => void
}

export interface PcmCaptureHandle {
  /** Analyser on the same graph for RMS / level metering. */
  analyser: AnalyserNode
  /** Tear down the audio graph and worklet. Idempotent. */
  stop: () => Promise<void>
  /** Current AudioContext sample rate — may differ from requested if unsupported. */
  sampleRate: number
}

/**
 * Start capturing int16 PCM from a MediaStream. The returned handle exposes an
 * AnalyserNode (for VAD) and a stop() that tears everything down.
 *
 * Callers must still stop the underlying MediaStream's tracks themselves —
 * this function only owns the audio graph, not the mic.
 */
export async function startPcmCapture(opts: PcmCaptureOptions): Promise<PcmCaptureHandle> {
  const targetRate = opts.sampleRate ?? 16000
  const batchSize = opts.batchSize ?? 1600

  // Chromium honors sampleRate here and resamples the mic input implicitly.
  // Some environments may refuse the rate and fall back — we pass the actual
  // rate back so callers can notice.
  let ctx: AudioContext
  try {
    ctx = new AudioContext({ sampleRate: targetRate })
  } catch {
    ctx = new AudioContext()
  }

  try {
    await ctx.audioWorklet.addModule(getWorkletUrl())
  } catch (err) {
    await ctx.close().catch(() => { /* ignore */ })
    throw err
  }

  const source = ctx.createMediaStreamSource(opts.stream)

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)

  const worklet = new AudioWorkletNode(ctx, WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { batchSize },
  })

  worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
    if (!(ev.data instanceof ArrayBuffer)) return
    opts.onPcm(new Uint8Array(ev.data))
  }
  worklet.onprocessorerror = (ev) => {
    opts.onError?.(new Error(`AudioWorklet processor error: ${String(ev)}`))
  }

  source.connect(worklet)

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    try { worklet.port.onmessage = null } catch { /* ignore */ }
    try { worklet.disconnect() } catch { /* ignore */ }
    try { source.disconnect() } catch { /* ignore */ }
    try { analyser.disconnect() } catch { /* ignore */ }
    await ctx.close().catch(() => { /* ignore */ })
  }

  return {
    analyser,
    stop,
    sampleRate: ctx.sampleRate,
  }
}
