import { net } from 'electron'
import { z } from 'zod'
import { t } from '../trpc'
import type { AuthManager } from '../../authManager'

export interface DictationDeps {
  authManager: AuthManager
  getServerUrl: () => string
}

async function serverFetch(
  deps: DictationDeps,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<Response> {
  const token = await deps.authManager.getAccessToken()
  if (!token) throw new Error('Sign in to use dictation')

  const url = `${deps.getServerUrl()}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  }

  const init: RequestInit = { method, headers }
  if (body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  console.log('[dictation-proxy]', method, url)
  const response = await net.fetch(url, init)

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (response.status === 401) throw new Error('Sign in to use dictation')
    if (response.status === 402) throw new Error('Monthly dictation minutes exceeded')
    throw new Error((data.error as string) ?? `Server error (${response.status})`)
  }

  return response
}

export function createDictationRouter(deps: DictationDeps) {
  return t.router({
    transcribe: t.procedure
      .input(z.object({
        audio: z.string(),
        mimeType: z.string().default('audio/webm'),
      }))
      .mutation(async ({ input }) => {
        const response = await serverFetch(deps, '/v1/transcribe', 'POST', {
          audio: input.audio,
          mimeType: input.mimeType,
        })
        return (await response.json()) as { text: string }
      }),

    cleanup: t.procedure
      .input(z.object({
        rawTranscript: z.string(),
        chunks: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const response = await serverFetch(deps, '/v1/cleanup', 'POST', {
          rawTranscript: input.rawTranscript,
          chunks: input.chunks,
        })
        return (await response.json()) as { cleanedText: string }
      }),

    usage: t.procedure
      .query(async () => {
        const response = await serverFetch(deps, '/v1/usage', 'GET')
        return (await response.json()) as {
          usedSeconds: number
          limitSeconds: number
          tier: string
          periodEnd: string
        }
      }),
  })
}
