import { useEffect, useRef } from 'react'
import { trpc } from '../trpc'
import { useSettingsStore } from '../stores/settingsStore'
import type { NotificationEvent } from '../types'

// Built-in sounds generated via Web Audio API
function createBuiltinSound(type: 'chime' | 'ping' | 'bell'): () => void {
  return () => {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    switch (type) {
      case 'chime': {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.5)
        break
      }
      case 'ping': {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1200, ctx.currentTime)
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.2)
        break
      }
      case 'bell': {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(659.25, ctx.currentTime)
        osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.15)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.6)
        break
      }
    }
  }
}

const builtinPlayers: Record<string, () => void> = {
  'builtin:chime': createBuiltinSound('chime'),
  'builtin:ping': createBuiltinSound('ping'),
  'builtin:bell': createBuiltinSound('bell'),
}

// Cache for custom sound Audio objects
const customSoundCache = new Map<string, HTMLAudioElement>()

async function loadCustomSound(key: string): Promise<HTMLAudioElement | null> {
  if (customSoundCache.has(key)) return customSoundCache.get(key)!
  try {
    const result = await trpc.app.getSoundData.query({ key })
    if (!result) return null
    const audio = new Audio(`data:${result.mimeType};base64,${result.data}`)
    customSoundCache.set(key, audio)
    return audio
  } catch {
    return null
  }
}

function playSound(soundKey: string) {
  if (!soundKey || soundKey === 'none') return

  if (soundKey.startsWith('builtin:')) {
    builtinPlayers[soundKey]?.()
    return
  }

  if (soundKey.startsWith('custom:')) {
    loadCustomSound(soundKey).then((audio) => {
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
    })
  }
}

export function clearSoundCache() {
  customSoundCache.clear()
}

export function previewSound(soundKey: string) {
  playSound(soundKey)
}

export function useSoundPlayer() {
  const settings = useSettingsStore((s) => s.settings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    if (!settings.soundEnabled) return

    const eventToSettingsKey: Record<string, NotificationEvent> = {
      'idle': 'completed',
      'needs_input': 'needsInput',
    }

    // Listen for agent status changes
    const statusSub = trpc.session.onAgentStatus.subscribe(undefined, {
      onData: ({ status }) => {
        if (!settingsRef.current.soundEnabled) return
        const settingsKey = eventToSettingsKey[status]
        if (!settingsKey) return
        const soundKey = settingsRef.current.notificationSounds?.[settingsKey]
        if (soundKey) playSound(soundKey)
      },
    })

    // Listen for session exits
    const exitSub = trpc.session.onExit.subscribe(undefined, {
      onData: () => {
        if (!settingsRef.current.soundEnabled) return
        const soundKey = settingsRef.current.notificationSounds?.exited
        if (soundKey) playSound(soundKey)
      },
    })

    return () => {
      statusSub.unsubscribe()
      exitSub.unsubscribe()
    }
  }, [settings.soundEnabled])
}
