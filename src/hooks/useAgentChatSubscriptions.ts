import { useEffect } from 'react'
import { trpc } from '../trpc'
import { useAgentChatStore } from '../stores/agentChatStore'

export function useAgentChatSubscriptions() {
  useEffect(() => {
    const chunkSub = trpc.agentChat.onChunk.subscribe(undefined, {
      onData: (data) => {
        const store = useAgentChatStore.getState()
        if (data.done) {
          store.markStreamDone()
        } else {
          store.appendDelta(data.messageId, data.delta)
        }
      },
    })

    const toolCallSub = trpc.agentChat.onToolCall.subscribe(undefined, {
      onData: (data) => {
        useAgentChatStore.getState().addToolCall(data.messageId, {
          id: data.toolCallId,
          name: data.name,
          arguments: data.arguments,
          status: data.status,
        })
      },
    })

    const toolCallUpdateSub = trpc.agentChat.onToolCallUpdate.subscribe(undefined, {
      onData: (data) => {
        useAgentChatStore.getState().updateToolCallStatus(
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
