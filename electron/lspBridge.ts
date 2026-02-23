/**
 * Content-Length framing helpers for LSP's JSON-RPC transport.
 * Language servers communicate via stdin/stdout using HTTP-style
 * `Content-Length: N\r\n\r\n{json}` framing.
 */

const HEADER_SEPARATOR = '\r\n\r\n'
const CONTENT_LENGTH_RE = /Content-Length:\s*(\d+)/i

/** Wrap a JSON string with Content-Length header for writing to a language server's stdin. */
export function encodeMessage(json: string): Buffer {
  const body = Buffer.from(json, 'utf-8')
  const header = `Content-Length: ${body.byteLength}${HEADER_SEPARATOR}`
  return Buffer.concat([Buffer.from(header, 'ascii'), body])
}

/**
 * Stateful parser that accumulates stdout chunks from a language server
 * and emits complete JSON strings when a full Content-Length-framed message
 * is received.
 */
export class LspMessageParser {
  private buffer = Buffer.alloc(0)
  private readonly onMessage: (json: string) => void

  constructor(onMessage: (json: string) => void) {
    this.onMessage = onMessage
  }

  /** Feed raw bytes from the language server's stdout. */
  write(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    this.parse()
  }

  private parse(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR)
      if (headerEnd === -1) return

      const headerStr = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = CONTENT_LENGTH_RE.exec(headerStr)
      if (!match) {
        // Malformed header — skip past it
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEPARATOR.length)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const bodyStart = headerEnd + HEADER_SEPARATOR.length
      const messageEnd = bodyStart + contentLength

      if (this.buffer.byteLength < messageEnd) {
        // Haven't received the full body yet — wait for more data
        return
      }

      const json = this.buffer.subarray(bodyStart, messageEnd).toString('utf-8')
      this.buffer = this.buffer.subarray(messageEnd)
      this.onMessage(json)
    }
  }
}
