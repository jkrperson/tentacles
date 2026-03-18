import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.map': 'application/json',
}

export function startRendererServer(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = new URL(req.url || '/', 'http://localhost').pathname
      const filePath = path.join(root, decodeURIComponent(urlPath))

      const isAsset = path.extname(filePath) && fs.existsSync(filePath)
      const resolved = isAsset ? filePath : path.join(root, 'index.html')

      try {
        const content = fs.readFileSync(resolved)
        const ext = path.extname(resolved)
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(0, 'localhost', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to get server address'))
        return
      }
      resolve(`http://localhost:${addr.port}`)
    })
    server.on('error', reject)
  })
}
