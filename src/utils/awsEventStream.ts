/**
 * AWS event-stream binary protocol codec.
 *
 * Used to frame audio events sent to, and decode transcript/exception events
 * received from, AWS Transcribe Streaming over WebSocket.
 *
 * Wire format (all integers big-endian):
 *   [prelude: 12 bytes]
 *     totalLength    (uint32) — full message length including prelude, headers, payload, and message CRC
 *     headersLength  (uint32) — length of the headers section in bytes
 *     preludeCrc     (uint32) — CRC32 of the first 8 prelude bytes
 *   [headers: headersLength bytes]
 *     repeated { nameLen (u8), name (utf8), valueType (u8), value (typed) }
 *   [payload: totalLength - headersLength - 16 bytes]
 *   [messageCrc: uint32] — CRC32 of everything from start of prelude through end of payload
 *
 * Only the subset of header value types Transcribe uses is implemented (string, type 7).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xFFFFFFFF
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}

const HEADER_VALUE_STRING = 7

export type StringHeaders = Record<string, string>

/**
 * Encode an event-stream message with string-only headers. Returns a fresh
 * Uint8Array ready to pass to WebSocket.send.
 */
export function encodeMessage(headers: StringHeaders, payload: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()

  // 1. Serialize headers
  const headerChunks: Uint8Array[] = []
  let headersLength = 0
  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = encoder.encode(name)
    if (nameBytes.length > 0xFF) {
      throw new Error(`Event-stream header name too long: ${name}`)
    }
    const valueBytes = encoder.encode(value)
    if (valueBytes.length > 0xFFFF) {
      throw new Error(`Event-stream header value too long: ${name}`)
    }

    const chunk = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length)
    const dv = new DataView(chunk.buffer)
    let offset = 0
    dv.setUint8(offset, nameBytes.length); offset += 1
    chunk.set(nameBytes, offset); offset += nameBytes.length
    dv.setUint8(offset, HEADER_VALUE_STRING); offset += 1
    dv.setUint16(offset, valueBytes.length, false); offset += 2
    chunk.set(valueBytes, offset)

    headerChunks.push(chunk)
    headersLength += chunk.length
  }

  // 2. Assemble message
  const totalLength = 12 /* prelude */ + headersLength + payload.length + 4 /* message CRC */
  const out = new Uint8Array(totalLength)
  const dv = new DataView(out.buffer)

  // Prelude
  dv.setUint32(0, totalLength, false)
  dv.setUint32(4, headersLength, false)
  const preludeCrc = crc32(out, 0, 8)
  dv.setUint32(8, preludeCrc, false)

  // Headers
  let offset = 12
  for (const c of headerChunks) {
    out.set(c, offset)
    offset += c.length
  }

  // Payload
  out.set(payload, offset)
  offset += payload.length

  // Message CRC over everything before it
  const messageCrc = crc32(out, 0, offset)
  dv.setUint32(offset, messageCrc, false)

  return out
}

export interface DecodedMessage {
  headers: StringHeaders
  payload: Uint8Array
}

/**
 * Decode a complete event-stream message. Throws on malformed input or bad
 * CRCs. Callers should feed complete messages — see splitFrames below for
 * reassembly from WebSocket chunks.
 */
export function decodeMessage(bytes: Uint8Array): DecodedMessage {
  if (bytes.length < 16) {
    throw new Error(`Event-stream message too short: ${bytes.length} bytes`)
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const totalLength = dv.getUint32(0, false)
  const headersLength = dv.getUint32(4, false)
  const preludeCrc = dv.getUint32(8, false)

  if (totalLength !== bytes.length) {
    throw new Error(`Event-stream length mismatch: prelude says ${totalLength}, got ${bytes.length}`)
  }
  const expectedPreludeCrc = crc32(bytes, 0, 8)
  if (preludeCrc !== expectedPreludeCrc) {
    throw new Error('Event-stream prelude CRC mismatch')
  }

  const messageCrc = dv.getUint32(totalLength - 4, false)
  const expectedMessageCrc = crc32(bytes, 0, totalLength - 4)
  if (messageCrc !== expectedMessageCrc) {
    throw new Error('Event-stream message CRC mismatch')
  }

  // Parse headers
  const headers: StringHeaders = {}
  const headersEnd = 12 + headersLength
  let offset = 12
  const decoder = new TextDecoder('utf-8', { fatal: false })
  while (offset < headersEnd) {
    const nameLen = dv.getUint8(offset); offset += 1
    const name = decoder.decode(bytes.subarray(offset, offset + nameLen))
    offset += nameLen
    const valueType = dv.getUint8(offset); offset += 1
    if (valueType !== HEADER_VALUE_STRING) {
      // Skip unknown types by seeking past their value.
      // We only expect strings from Transcribe Streaming.
      offset = skipHeaderValue(dv, offset, valueType)
      continue
    }
    const valueLen = dv.getUint16(offset, false); offset += 2
    headers[name] = decoder.decode(bytes.subarray(offset, offset + valueLen))
    offset += valueLen
  }

  const payload = bytes.subarray(headersEnd, totalLength - 4)
  return { headers, payload }
}

/**
 * Skip a non-string header value. Returns the new offset past the value.
 * AWS event-stream defines:
 *   0 true (0 bytes)   1 false (0 bytes)   2 int8 (1)   3 int16 (2)
 *   4 int32 (4)        5 int64 (8)         6 bytes (2-byte len)
 *   7 string (2-byte len) 8 timestamp (8)  9 uuid (16)
 */
function skipHeaderValue(dv: DataView, offset: number, type: number): number {
  switch (type) {
    case 0: case 1: return offset
    case 2: return offset + 1
    case 3: return offset + 2
    case 4: return offset + 4
    case 5: case 8: return offset + 8
    case 6: case 7: {
      const len = dv.getUint16(offset, false)
      return offset + 2 + len
    }
    case 9: return offset + 16
    default:
      throw new Error(`Unknown event-stream header value type: ${type}`)
  }
}

/**
 * Frame reassembler for WebSocket binary data. AWS usually sends one message
 * per frame, but the protocol allows fragmentation, so we buffer and emit
 * complete messages as they arrive.
 */
export class EventStreamDecoder {
  private buffer = new Uint8Array(0)

  push(chunk: Uint8Array): DecodedMessage[] {
    // Concatenate
    const combined = new Uint8Array(this.buffer.length + chunk.length)
    combined.set(this.buffer, 0)
    combined.set(chunk, this.buffer.length)
    this.buffer = combined

    const out: DecodedMessage[] = []
    while (this.buffer.length >= 12) {
      const dv = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)
      const totalLength = dv.getUint32(0, false)
      if (totalLength < 16 || totalLength > 16 * 1024 * 1024) {
        // Corrupt framing — drop the buffer to recover rather than loop forever.
        this.buffer = new Uint8Array(0)
        throw new Error(`Event-stream reports implausible message length: ${totalLength}`)
      }
      if (this.buffer.length < totalLength) break
      const msgBytes = this.buffer.subarray(0, totalLength)
      out.push(decodeMessage(msgBytes))
      this.buffer = this.buffer.subarray(totalLength)
    }
    return out
  }
}

// ---- Transcribe-specific helpers ----------------------------------------

/** Build an AudioEvent frame carrying raw PCM bytes. */
export function encodeAudioEvent(pcm: Uint8Array): Uint8Array {
  return encodeMessage(
    {
      ':message-type': 'event',
      ':event-type': 'AudioEvent',
      ':content-type': 'application/octet-stream',
    },
    pcm,
  )
}

/** Build an empty AudioEvent to signal end-of-stream to Transcribe. */
export function encodeEndOfStream(): Uint8Array {
  return encodeAudioEvent(new Uint8Array(0))
}

export interface TranscribeResultAlt {
  Transcript?: string
}
export interface TranscribeResult {
  ResultId?: string
  IsPartial?: boolean
  Alternatives?: TranscribeResultAlt[]
}
export interface TranscribeEventPayload {
  Transcript?: { Results?: TranscribeResult[] }
}

/**
 * Route a decoded event to a higher-level shape. Returns one of:
 *   - kind: 'transcript' with parsed results
 *   - kind: 'exception' with code + message
 *   - kind: 'unknown' for anything else (safe to ignore)
 */
export type TranscribeEvent =
  | { kind: 'transcript'; results: TranscribeResult[] }
  | { kind: 'exception'; code: string; message: string }
  | { kind: 'unknown'; headers: StringHeaders }

export function parseTranscribeEvent(msg: DecodedMessage): TranscribeEvent {
  const messageType = msg.headers[':message-type']
  const eventType = msg.headers[':event-type']

  if (messageType === 'event' && eventType === 'TranscriptEvent') {
    const text = new TextDecoder('utf-8').decode(msg.payload)
    let parsed: TranscribeEventPayload = {}
    try {
      parsed = JSON.parse(text) as TranscribeEventPayload
    } catch {
      // Malformed JSON — treat as empty event.
    }
    return { kind: 'transcript', results: parsed.Transcript?.Results ?? [] }
  }

  if (messageType === 'exception') {
    const text = new TextDecoder('utf-8').decode(msg.payload)
    let message = text
    try {
      const parsed = JSON.parse(text) as { Message?: string; message?: string }
      message = parsed.Message ?? parsed.message ?? text
    } catch {
      // Leave as raw payload text.
    }
    const code = msg.headers[':exception-type'] ?? msg.headers[':error-code'] ?? 'UnknownException'
    return { kind: 'exception', code, message }
  }

  return { kind: 'unknown', headers: msg.headers }
}
