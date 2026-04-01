import posthog from 'posthog-js'
import type { TelemetryEvent } from './telemetryEvents'
import { useSettingsStore } from '../stores/settingsStore'

let initialized = false

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
  if (!key) return

  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    persistence: 'localStorage',
  })

  posthog.register({
    app_name: 'tentacles',
    os_platform: navigator.platform,
  })

  initialized = true
}

export function capture(event: TelemetryEvent, properties?: Record<string, unknown>) {
  if (!initialized) return
  const { telemetryEnabled } = useSettingsStore.getState().settings
  if (!telemetryEnabled) return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (!initialized) return
  posthog.identify(userId, traits)
}

export function resetUser() {
  if (!initialized) return
  posthog.reset()
}

export function shutdownPostHog() {
  if (!initialized) return
  posthog.reset()
  initialized = false
}
