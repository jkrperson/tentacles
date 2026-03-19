import * as fs from 'node:fs'
import * as path from 'node:path'
import * as http from 'node:http'
import { safeStorage, shell } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ee } from './trpc/events'
import type { GitHubUser } from '../src/types'

/** HTML page served at the callback URL. Reads the token fragment and POSTs it back. */
const CALLBACK_HTML = `<!DOCTYPE html><html><body><script>
  const h = window.location.hash.substring(1);
  fetch('/token', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: h })
    .then(() => { document.body.innerText = 'Signed in! You can close this tab.'; })
    .catch(() => { document.body.innerText = 'Something went wrong.'; });
</script><p>Signing in…</p></body></html>`

const CALLBACK_PORT = 43587

export class AuthManager {
  private supabase: SupabaseClient
  private authFilePath: string
  private currentUser: GitHubUser | null = null
  private loginResolver: ((user: GitHubUser) => void) | null = null
  private callbackServer: http.Server | null = null

  constructor(supabaseUrl: string, supabaseAnonKey: string, userDataPath: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // we handle persistence ourselves with safeStorage
      },
    })
    this.authFilePath = path.join(userDataPath, 'auth.json')
  }

  /** Try to restore a stored session on startup. */
  async getStoredAuth(): Promise<GitHubUser | null> {
    try {
      if (!fs.existsSync(this.authFilePath)) return null

      const encrypted = fs.readFileSync(this.authFilePath)
      if (!safeStorage.isEncryptionAvailable()) return null

      const decrypted = safeStorage.decryptString(encrypted)
      const { access_token, refresh_token } = JSON.parse(decrypted)

      const { data, error } = await this.supabase.auth.setSession({
        access_token,
        refresh_token,
      })

      if (error || !data.user) {
        this.deleteStoredAuth()
        return null
      }

      this.currentUser = this.extractUser(data.user)

      // Persist refreshed tokens
      if (data.session) {
        this.persistSession(data.session.access_token, data.session.refresh_token)
      }

      return this.currentUser
    } catch {
      this.deleteStoredAuth()
      return null
    }
  }

  /** Get the currently authenticated user (from memory). */
  getUser(): GitHubUser | null {
    return this.currentUser
  }

  /** Start the OAuth login flow. Returns a promise that resolves when callback is handled. */
  async startLogin(): Promise<GitHubUser> {
    const redirectUrl = `http://localhost:${CALLBACK_PORT}/callback`

    // Start a temporary local server to catch the OAuth redirect
    await this.startCallbackServer()

    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    })

    if (error || !data.url) {
      this.stopCallbackServer()
      throw new Error(error?.message ?? 'Failed to get OAuth URL')
    }

    await shell.openExternal(data.url)

    return new Promise<GitHubUser>((resolve) => {
      this.loginResolver = resolve
    })
  }

  /** Handle the token payload from the callback. */
  async handleCallback(fragment: string): Promise<void> {
    const params = new URLSearchParams(fragment)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      console.error('[auth] Missing tokens in callback')
      return
    }

    const { data, error } = await this.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error || !data.user) {
      console.error('[auth] Failed to set session:', error?.message)
      return
    }

    this.currentUser = this.extractUser(data.user)
    this.persistSession(accessToken, data.session?.refresh_token ?? refreshToken)

    ee.emit('auth:changed', { user: this.currentUser })

    if (this.loginResolver) {
      this.loginResolver(this.currentUser)
      this.loginResolver = null
    }
  }

  /** Sign the user out. */
  async logout(): Promise<void> {
    await this.supabase.auth.signOut()
    this.currentUser = null
    this.deleteStoredAuth()
    ee.emit('auth:changed', { user: null })
  }

  /** Shut down the callback server if running (called on app quit). */
  cleanup(): void {
    this.stopCallbackServer()
  }

  // --- Local callback server ---

  private startCallbackServer(): Promise<void> {
    this.stopCallbackServer()

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url === '/callback' || req.url?.startsWith('/callback?')) {
          // Serve HTML that reads the fragment and posts it back
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(CALLBACK_HTML)
        } else if (req.url === '/token' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            res.writeHead(200, {
              'Content-Type': 'text/plain',
              'Access-Control-Allow-Origin': '*',
            })
            res.end('ok')
            this.handleCallback(body)
            // Give the response time to flush, then shut down
            setTimeout(() => this.stopCallbackServer(), 500)
          })
        } else {
          res.writeHead(404)
          res.end()
        }
      })

      server.on('error', reject)
      server.listen(CALLBACK_PORT, '127.0.0.1', () => {
        this.callbackServer = server
        resolve()
      })
    })
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }

  // --- Helpers ---

  private extractUser(user: { id: string; user_metadata: Record<string, unknown> }): GitHubUser {
    const meta = user.user_metadata
    return {
      id: user.id,
      login: (meta.user_name as string) ?? (meta.preferred_username as string) ?? 'unknown',
      avatarUrl: (meta.avatar_url as string) ?? '',
      name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    }
  }

  private persistSession(accessToken: string, refreshToken: string): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) return
      const data = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
      const encrypted = safeStorage.encryptString(data)
      fs.mkdirSync(path.dirname(this.authFilePath), { recursive: true })
      fs.writeFileSync(this.authFilePath, encrypted)
    } catch (err) {
      console.error('[auth] Failed to persist session:', err)
    }
  }

  private deleteStoredAuth(): void {
    try {
      if (fs.existsSync(this.authFilePath)) {
        fs.unlinkSync(this.authFilePath)
      }
    } catch { /* ignore */ }
  }
}
