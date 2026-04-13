import { useEffect } from 'react'
import { trpc } from '../trpc'
import { useVoiceCommandStore } from '../stores/voiceCommandStore'

export function useVoiceCommandSubscriptions() {
  useEffect(() => {
    const chunkSub = trpc.voiceCommand.onChunk.subscribe(undefined, {
      onData: (data) => {
        const store = useVoiceCommandStore.getState()
        if (data.done) {
          store.markStreamDone()
        } else {
          store.appendDelta(data.messageId, data.delta)
        }
      },
    })

    const toolCallSub = trpc.voiceCommand.onToolCall.subscribe(undefined, {
      onData: (data) => {
        useVoiceCommandStore.getState().addToolCall(data.messageId, {
          id: data.toolCallId,
          name: data.name,
          arguments: data.arguments,
          status: data.status,
        })
      },
    })

    const toolCallUpdateSub = trpc.voiceCommand.onToolCallUpdate.subscribe(undefined, {
      onData: (data) => {
        useVoiceCommandStore.getState().updateToolCallStatus(
          data.toolCallId,
          data.status,
          data.result,
          data.error,
        )
      },
    })

    return () => {
      chunkSub.unsubscribe()
      toolCallSub.unsubscribe()
      toolCallUpdateSub.unsubscribe()
    }
  }, [])
}
