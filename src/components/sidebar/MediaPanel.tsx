import { useState, useCallback } from 'react'

type Service = 'youtube' | 'twitch'

function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // watch?v=ID
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return watchMatch[1]

  // youtu.be/ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]

  // /embed/ID
  const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) return embedMatch[1]

  // /live/ID
  const liveMatch = trimmed.match(/\/live\/([a-zA-Z0-9_-]{11})/)
  if (liveMatch) return liveMatch[1]

  // bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

  return null
}

function parseTwitchChannel(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // twitch.tv/channel
  const urlMatch = trimmed.match(/twitch\.tv\/([a-zA-Z0-9_]+)/)
  if (urlMatch) return urlMatch[1]

  // bare channel name
  if (/^[a-zA-Z0-9_]+$/.test(trimmed)) return trimmed

  return null
}

export function MediaPanel() {
  const [service, setService] = useState<Service>('youtube')
  const [url, setUrl] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const youtubeId = service === 'youtube' ? parseYouTubeId(url) : null
  const twitchChannel = service === 'twitch' ? parseTwitchChannel(url) : null
  const hasEmbed = !!(youtubeId || twitchChannel)

  const handleServiceSwitch = useCallback((s: Service) => {
    setService(s)
    setUrl('')
  }, [])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 h-7 flex-shrink-0 border-b border-[var(--t-border)]">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Media</span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => handleServiceSwitch('youtube')}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              service === 'youtube'
                ? 'text-zinc-200 bg-[var(--t-bg-hover)]'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            YT
          </button>
          <button
            onClick={() => handleServiceSwitch('twitch')}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              service === 'twitch'
                ? 'text-zinc-200 bg-[var(--t-bg-hover)]'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            TTV
          </button>
        </div>
      </div>

      {/* Content — hidden (not unmounted) when collapsed to preserve iframe state */}
      <div className={`flex-1 min-h-0 flex flex-col ${collapsed ? 'hidden' : ''}`}>
        {/* URL input */}
        <div className="px-2 py-1.5 flex-shrink-0">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={service === 'youtube' ? 'YouTube URL or video ID' : 'Twitch channel name or URL'}
            className="w-full bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded px-2 py-1 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {/* Embed or empty state */}
        <div className="flex-1 min-h-0 relative">
          {youtubeId && (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {twitchChannel && (
            <iframe
              src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=${window.location.hostname}`}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
            />
          )}
          {!hasEmbed && (
            <div className="flex items-center justify-center h-full">
              <span className="text-[11px] text-zinc-600">
                {url ? 'Invalid URL' : `Paste a ${service === 'youtube' ? 'YouTube' : 'Twitch'} link above`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
