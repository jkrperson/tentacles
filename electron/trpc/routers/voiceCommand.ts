import { z } from 'zod'
import OpenAI from 'openai'
import { t } from '../trpc'
import { createSubscription } from '../helpers'
import { ee } from '../events'
import type { AgentChatToolName } from '../../../src/types/agentChat'
import { VOICE_AUTO_EXECUTE_TOOLS } from '../../../src/types/voiceCommand'
import { TOOL_DEFINITIONS, executeTool, type AgentToolDeps } from './shared/agentTools'

type VoiceCommandDeps = AgentToolDeps

// In-memory conversation state keyed by conversationId
const conversations = new Map<string, OpenAI.Chat.Completions.ChatCompletionMessageParam[]>()

// Pending tool calls waiting for confirmation
const pendingToolCalls = new Map<string, {
  conversationId: string
  messageId: string
  name: AgentChatToolName
  arguments: Record<string, unknown>
}>()

// Active streams for cancellation
const activeStreams = new Map<string, AbortController>()

const MAX_CONVERSATION_MESSAGES = 12 // system + last 6 exchanges

const SYSTEM_PROMPT = `You are the Tentacles voice command assistant. You parse spoken commands into actions.

Rules:
- Be extremely brief. One short sentence max.
- Prefer tool calls over text explanations.
- If the user says "open [name]", match it to the closest project name.
- For ambiguous navigation requests (open, switch, list), pick the most likely interpretation and act.

Session creation rules:
- Sessions MUST be created inside a workspace, not directly under a project.
- Every project has workspaces (at minimum a "main" workspace).
- When the user says "create a session in [project]" WITHOUT specifying a workspace, first call list_workspaces to see what's available, then ask which workspace they want. Do NOT assume the main workspace.
- If the user specifies both project and workspace (e.g., "create a session in the main workspace of tentacles"), proceed directly.
- When there is only one workspace, use it without asking.

Available tools: list_projects, open_project, list_workspaces, create_workspace, create_session, list_sessions, close_session.`

function isAuthError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    if ('status' in err && (err as { status: number }).status === 401) return true
    if ('code' in err && (err as { code: string }).code === 'invalid_api_key') return true
  }
  return false
}

function trimConversation(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  // Keep system message + last N messages. Skip leading `tool` messages whose
  // parent `assistant(tool_calls)` would be dropped — the API rejects orphan tool results.
  if (messages.length <= MAX_CONVERSATION_MESSAGES) return
  const system = messages[0]
  let startIdx = messages.length - (MAX_CONVERSATION_MESSAGES - 1)
  while (startIdx < messages.length && messages[startIdx].role === 'tool') {
    startIdx++
  }
  const recent = messages.slice(startIdx)
  messages.length = 0
  messages.push(system, ...recent)
}

/**
 * Return a copy of `messages` that is guaranteed to be valid for the OpenAI Chat Completions API:
 * every `assistant(tool_calls)` is immediately followed by one `tool` reply per tool_call id.
 *
 * Tool replies can legitimately arrive out-of-order (renderer actions report results async via
 * `reportToolResult` after the user has already spoken again), so we index all tool replies by
 * `tool_call_id` and splice them back next to their parent. Missing replies get a stub so the
 * API never rejects the request; orphan tool messages are dropped.
 */
function sanitizeForAPI(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const toolReplies = new Map<string, OpenAI.Chat.Completions.ChatCompletionMessageParam>()
  for (const msg of messages) {
    if (msg.role === 'tool' && !toolReplies.has(msg.tool_call_id)) {
      toolReplies.set(msg.tool_call_id, msg)
    }
  }

  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
  for (const msg of messages) {
    if (msg.role === 'tool') continue
    result.push(msg)
    if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const reply = toolReplies.get(tc.id)
        if (reply) {
          result.push(reply)
        } else {
          result.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '{"status":"pending"}',
          })
        }
      }
    }
  }
  return result
}

export function createVoiceCommandRouter(deps: VoiceCommandDeps) {
  return t.router({
    sendMessage: t.procedure
      .input(z.object({
        conversationId: z.string(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const apiKey = deps.keyManager.getKey()
        if (!apiKey) throw new Error('OpenAI API key not configured')

        const client = new OpenAI({ apiKey })
        const messageId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

        let messages = conversations.get(input.conversationId)
        if (!messages) {
          messages = [{ role: 'system', content: SYSTEM_PROMPT }]
          conversations.set(input.conversationId, messages)
        }

        messages.push({ role: 'user', content: input.content })
        trimConversation(messages)

        const abortController = new AbortController()
        activeStreams.set(input.conversationId, abortController)

        try {
          await streamCompletion(client, deps, input.conversationId, messages, messageId, abortController)
        } catch (err) {
          if (isAuthError(err)) throw new Error('INVALID_API_KEY')
          throw err
        } finally {
          activeStreams.delete(input.conversationId)
        }

        return { messageId }
      }),

    confirmToolCall: t.procedure
      .input(z.object({
        toolCallId: z.string(),
        approved: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const pending = pendingToolCalls.get(input.toolCallId)
        if (!pending) throw new Error('Tool call not found or already processed')

        pendingToolCalls.delete(input.toolCallId)

        if (!input.approved) {
          ee.emit('voiceCommand:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'error',
            error: 'Action denied by user',
          })
          const messages = conversations.get(pending.conversationId)
          if (messages) {
            messages.push({
              role: 'tool',
              tool_call_id: input.toolCallId,
              content: 'User denied this action.',
            })
          }
          return { success: false, reason: 'denied' }
        }

        ee.emit('voiceCommand:toolCallUpdate', {
          toolCallId: input.toolCallId,
          status: 'executing',
        })

        try {
          const result = await executeTool(deps, pending.name, pending.arguments)
          const isRendererAction = result && typeof result === 'object' && '_rendererAction' in result

          ee.emit('voiceCommand:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'complete',
            result,
          })

          if (isRendererAction) {
            return { success: true, result, rendererAction: true }
          }

          const messages = conversations.get(pending.conversationId)
          if (messages) {
            messages.push({
              role: 'tool',
              tool_call_id: input.toolCallId,
              content: JSON.stringify(result),
            })

            const apiKey = deps.keyManager.getKey()
            if (apiKey) {
              const client = new OpenAI({ apiKey })
              const followUpId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
              const abortController = new AbortController()
              activeStreams.set(pending.conversationId, abortController)
              try {
                await streamCompletion(client, deps, pending.conversationId, messages, followUpId, abortController)
              } finally {
                activeStreams.delete(pending.conversationId)
              }
            }
          }

          return { success: true, result }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          ee.emit('voiceCommand:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'error',
            error: errorMsg,
          })
          const messages = conversations.get(pending.conversationId)
          if (messages) {
            messages.push({
              role: 'tool',
              tool_call_id: input.toolCallId,
              content: `Error: ${errorMsg}`,
            })
          }
          return { success: false, reason: errorMsg }
        }
      }),

    reportToolResult: t.procedure
      .input(z.object({
        conversationId: z.string(),
        toolCallId: z.string(),
        result: z.string(),
      }))
      .mutation(async ({ input }) => {
        const messages = conversations.get(input.conversationId)
        if (!messages) return

        messages.push({
          role: 'tool',
          tool_call_id: input.toolCallId,
          content: input.result,
        })

        const apiKey = deps.keyManager.getKey()
        if (apiKey) {
          const client = new OpenAI({ apiKey })
          const followUpId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          const abortController = new AbortController()
          activeStreams.set(input.conversationId, abortController)
          try {
            await streamCompletion(client, deps, input.conversationId, messages, followUpId, abortController)
          } finally {
            activeStreams.delete(input.conversationId)
          }
        }
      }),

    cancelStream: t.procedure
      .input(z.object({ conversationId: z.string() }))
      .mutation(({ input }) => {
        const controller = activeStreams.get(input.conversationId)
        if (controller) {
          controller.abort()
          activeStreams.delete(input.conversationId)
        }
      }),

    clearConversation: t.procedure
      .input(z.object({ conversationId: z.string() }))
      .mutation(({ input }) => {
        conversations.delete(input.conversationId)
      }),

    onChunk: createSubscription('voiceCommand:chunk'),
    onToolCall: createSubscription('voiceCommand:toolCall'),
    onToolCallUpdate: createSubscription('voiceCommand:toolCallUpdate'),
  })
}

async function streamCompletion(
  client: OpenAI,
  deps: VoiceCommandDeps,
  conversationId: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  messageId: string,
  abortController: AbortController,
) {
  const stream = client.chat.completions.stream(
    {
      model: 'gpt-4.1-mini',
      messages: sanitizeForAPI(messages),
      tools: TOOL_DEFINITIONS,
    },
    { signal: abortController.signal },
  )

  let fullContent = ''
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

  for await (const event of stream) {
    const choice = event.choices?.[0]
    if (!choice) continue

    const delta = choice.delta

    if (delta?.content) {
      fullContent += delta.content
      ee.emit('voiceCommand:chunk', {
        messageId,
        delta: delta.content,
        done: false,
      })
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = toolCalls.get(tc.index)
        if (existing) {
          if (tc.function?.arguments) {
            existing.arguments += tc.function.arguments
          }
        } else {
          toolCalls.set(tc.index, {
            id: tc.id ?? `tc_${Date.now()}_${tc.index}`,
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
          })
        }
      }
    }

    if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
      break
    }
  }

  ee.emit('voiceCommand:chunk', { messageId, delta: '', done: true })

  if (toolCalls.size > 0) {
    const assistantToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = []
    const autoApproveQueue: { id: string; name: AgentChatToolName; arguments: Record<string, unknown> }[] = []

    for (const [, tc] of toolCalls) {
      assistantToolCalls.push({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })

      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(tc.arguments || '{}')
      } catch { /* use empty */ }

      const toolName = tc.name as AgentChatToolName
      const isAutoExecute = VOICE_AUTO_EXECUTE_TOOLS.includes(toolName)

      if (isAutoExecute) {
        ee.emit('voiceCommand:toolCall', {
          messageId,
          toolCallId: tc.id,
          name: toolName,
          arguments: parsedArgs,
          status: 'executing',
        })
        autoApproveQueue.push({ id: tc.id, name: toolName, arguments: parsedArgs })
      } else {
        pendingToolCalls.set(tc.id, {
          conversationId,
          messageId,
          name: toolName,
          arguments: parsedArgs,
        })

        ee.emit('voiceCommand:toolCall', {
          messageId,
          toolCallId: tc.id,
          name: toolName,
          arguments: parsedArgs,
          status: 'pending_confirmation',
        })
      }
    }

    messages.push({
      role: 'assistant',
      content: fullContent || null,
      tool_calls: assistantToolCalls,
    })

    let hasRendererAction = false
    for (const autoTool of autoApproveQueue) {
      try {
        const result = await executeTool(deps, autoTool.name, autoTool.arguments)

        // For renderer actions that are auto-approved (e.g., open_project),
        // emit as complete so the renderer can execute the action
        ee.emit('voiceCommand:toolCallUpdate', {
          toolCallId: autoTool.id,
          status: 'complete',
          result,
        })

        const isRendererAction = result && typeof result === 'object' && '_rendererAction' in result
        if (isRendererAction) {
          hasRendererAction = true
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: autoTool.id,
            content: JSON.stringify(result),
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        ee.emit('voiceCommand:toolCallUpdate', {
          toolCallId: autoTool.id,
          status: 'error',
          error: errorMsg,
        })
        messages.push({
          role: 'tool',
          tool_call_id: autoTool.id,
          content: `Error: ${errorMsg}`,
        })
      }
    }

    // Follow up only when every tool_call already has a matching `tool` reply in messages.
    // Renderer actions resolve client-side and route their results back through reportToolResult,
    // which triggers its own follow-up stream once the tool reply is pushed.
    const hasPending = toolCalls.size > autoApproveQueue.length
    if (!hasPending && autoApproveQueue.length > 0 && !hasRendererAction) {
      const followUpId = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await streamCompletion(client, deps, conversationId, messages, followUpId, abortController)
    }
  } else {
    messages.push({
      role: 'assistant',
      content: fullContent,
    })
  }
}
