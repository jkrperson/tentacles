import * as fs from 'node:fs'
import * as path from 'node:path'

const MAX_SCROLLBACK_BYTES = 5 * 1024 * 1024 // 5MB circular buffer

interface ScrollbackMeta {
  writePos: number
  totalWritten: number
  cols: number
  rows: number
  cwd: string
  createdAt: number
  lastDataAt: number
}

export class ScrollbackWriter {
  private fd: number
  private meta: ScrollbackMeta
  private metaPath: string
  private binPath: string
  private metaDirty = false
  private metaFlushTimer: ReturnType<typeof setInterval> | null = null

  constructor(sessionDir: string, cols: number, rows: number, cwd: string) {
    fs.mkdirSync(sessionDir, { recursive: true })

    this.binPath = path.join(sessionDir, 'scrollback.bin')
    this.metaPath = path.join(sessionDir, 'meta.json')

    // Allocate or open the scrollback file
    if (!fs.existsSync(this.binPath)) {
      // Pre-allocate by writing a zero-length file — we'll write in place
      fs.writeFileSync(this.binPath, Buffer.alloc(0))
    }
    this.fd = fs.openSync(this.binPath, 'r+')

    this.meta = {
      writePos: 0,
      totalWritten: 0,
      cols,
      rows,
      cwd,
      createdAt: Date.now(),
      lastDataAt: Date.now(),
    }
    this.flushMeta()

    // Periodically flush meta to disk
    this.metaFlushTimer = setInterval(() => {
      if (this.metaDirty) this.flushMeta()
    }, 2000)
  }

  write(data: string) {
    const buf = Buffer.from(data, 'utf-8')
    let offset = 0

    while (offset < buf.length) {
      const remaining = MAX_SCROLLBACK_BYTES - this.meta.writePos
      const chunk = buf.subarray(offset, offset + remaining)
      fs.writeSync(this.fd, chunk, 0, chunk.length, this.meta.writePos)
      this.meta.writePos = (this.meta.writePos + chunk.length) % MAX_SCROLLBACK_BYTES
      offset += chunk.length
    }

    this.meta.totalWritten += buf.length
    this.meta.lastDataAt = Date.now()
    this.metaDirty = true
  }

  updateSize(cols: number, rows: number) {
    this.meta.cols = cols
    this.meta.rows = rows
    this.metaDirty = true
  }

  private flushMeta() {
    fs.writeFileSync(this.metaPath, JSON.stringify(this.meta))
    this.metaDirty = false
  }

  close() {
    if (this.metaFlushTimer) {
      clearInterval(this.metaFlushTimer)
      this.metaFlushTimer = null
    }
    this.flushMeta()
    fs.closeSync(this.fd)
  }
}

/** Read scrollback for a session, returning data in correct order. */
export function readScrollback(sessionDir: string): string {
  const metaPath = path.join(sessionDir, 'meta.json')
  const binPath = path.join(sessionDir, 'scrollback.bin')

  if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return ''

  const meta: ScrollbackMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  const fileSize = fs.statSync(binPath).size

  if (meta.totalWritten === 0 || fileSize === 0) return ''

  const buf = fs.readFileSync(binPath)

  if (meta.totalWritten <= MAX_SCROLLBACK_BYTES) {
    // Haven't wrapped yet — data is contiguous from 0 to writePos
    return buf.subarray(0, meta.writePos).toString('utf-8')
  }

  // Wrapped — read from writePos to end, then start to writePos
  const tail = buf.subarray(meta.writePos)
  const head = buf.subarray(0, meta.writePos)
  return Buffer.concat([tail, head]).toString('utf-8')
}

/** Remove scrollback files for a session. */
export function removeScrollback(sessionDir: string) {
  try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch { /* ignore */ }
}
