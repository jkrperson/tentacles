import { EventEmitter } from 'events'
import type { FileChangeEvent, UpdaterStatus } from '../../src/types'

export interface EventMap {
  'session:data': { id: string; data: string }
  'session:exit': { id: string; exitCode: number }
  'session:title': { id: string; title: string }
  'session:claudeSessionId': { id: string; claudeSessionId: string }
  'session:statusDetail': { id: string; detail: string | null }
  'session:agentStatus': { id: string; status: 'running' | 'idle' }
  'terminal:data': { id: string; data: string }
  'terminal:exit': { id: string; exitCode: number }
  'file:changed': FileChangeEvent
  'updater:status': UpdaterStatus
}

class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event as string, data)
  }
  override on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event as string, listener)
  }
  override off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event as string, listener)
  }
}

export const ee = new TypedEventEmitter()
// Prevent listener limit warnings — subscriptions may add many listeners
ee.setMaxListeners(100)
