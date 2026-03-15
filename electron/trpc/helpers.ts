import { observable } from '@trpc/server/observable'
import { t } from './trpc'
import { ee } from './events'
import type { EventMap } from './events'

export function createSubscription<K extends keyof EventMap>(event: K) {
  return t.procedure.subscription(() =>
    observable<EventMap[K]>((emit) => {
      const handler = (data: EventMap[K]) => emit.next(data)
      ee.on(event, handler)
      return () => { ee.off(event, handler) }
    })
  )
}
