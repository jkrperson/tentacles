import { z } from 'zod'
import OpenAI from 'openai'
import { t } from '../trpc'
import { createSubscription } from '../helpers'
import { ee } from '../events'
import { READ_ONLY_TOOLS } from '../../../src/types/agentChat'
import type { AgentChatToolName } from '../../../src/types/agentChat'
import { TOOL_DEFINITIONS, executeTool, type AgentToolDeps } from './shared/agentTools'

type AgentChatDeps = AgentToolDeps

// In-memory conversation state (OpenAI format) keyed by conversationId
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

const SYSTEM_PROMPT = `You are the Tentacles platform assistant. You help users manage their projects, workspaces, and coding sessions through natural language.

You have access to the following tools:
- list_projects: List all known projects in the platform
- open_project: Switch to a specific project by path
- list_workspaces: List all workspaces (main + worktrees) for a project
- create_workspace: Create a new git worktree workspace in a project
- create_session: Create a new agent coding session in a workspace
- list_sessions: List all active agent sessions
- close_session: Close/terminate an agent session by ID

Important: Sessions must be created inside a workspace. Every project has a "main" workspace by default. Use list_workspaces to find the right workspace, then create_session with that workspaceId.

Be concise and helpful. When the user asks you to do something, use the appropriate tool. Explain what you're about to do briefly before calling a tool.`


function isAuthError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    // OpenAI SDK throws AuthenticationError with status 401
    if ('status' in err && (err as { status: number }).status === 401) return true
    if ('code' in err && (err as { code: string }).code === 'invalid_api_key') return true
  }
  return false
}

export function createAgentChatRouter(deps: AgentChatDeps) {
  return t.router({
    hasApiKey: t.procedure.query(() => {
      return deps.keyManager.hasKey()
    }),

    setApiKey: t.procedure
      .input(z.object({ key: z.string().min(1) }))
      .mutation(({ input }) => {
        deps.keyManager.setKey(input.key)
      }),

    deleteApiKey: t.procedure.mutation(() => {
      deps.keyManager.deleteKey()
    }),

    sendMessage: t.procedure
      .input(z.object({
        conversationId: z.string(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const apiKey = deps.keyManager.getKey()
        if (!apiKey) throw new Error('OpenAI API key not configured')

        const client = new OpenAI({ apiKey })
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

        // Get or create conversation
        let messages = conversations.get(input.conversationId)
        if (!messages) {
          messages = [{ role: 'system', content: SYSTEM_PROMPT }]
          conversations.set(input.conversationId, messages)
        }

        // Add user message
        messages.push({ role: 'user', content: input.content })

        // Set up abort controller
        const abortController = new AbortController()
        activeStreams.set(input.conversationId, abortController)

        try {
          await streamCompletion(client, deps, input.conversationId, messages, messageId, abortController)
        } catch (err) {
          // Detect OpenAI auth errors and provide a clear message
          if (isAuthError(err)) {
            throw new Error('INVALID_API_KEY')
          }
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
          ee.emit('agentChat:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'error',
            error: 'Action denied by user',
          })
          // Add denial to conversation so the model knows
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

        // Execute the tool
        ee.emit('agentChat:toolCallUpdate', {
          toolCallId: input.toolCallId,
          status: 'executing',
        })

        try {
          const result = await executeTool(deps, pending.name, pending.arguments)

          // Check if this is a renderer-side action
          const isRendererAction = result && typeof result === 'object' && '_rendererAction' in result

          ee.emit('agentChat:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'complete',
            result,
          })

          if (isRendererAction) {
            // Renderer will execute the action and call reportToolResult
            // Do NOT push tool result or trigger follow-up here
            return { success: true, result, rendererAction: true }
          }

          // For main-process-only tools, push result and trigger follow-up
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
              const followUpId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
          ee.emit('agentChat:toolCallUpdate', {
            toolCallId: input.toolCallId,
            status: 'error',
            error: errorMsg,
          })

          // Add error to conversation
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

    // Called by renderer after executing a _rendererAction tool result
    reportToolResult: t.procedure
      .input(z.object({
        conversationId: z.string(),
        toolCallId: z.string(),
        result: z.string(), // JSON-stringified result
      }))
      .mutation(async ({ input }) => {
        const messages = conversations.get(input.conversationId)
        if (!messages) return

        messages.push({
          role: 'tool',
          tool_call_id: input.toolCallId,
          content: input.result,
        })

        // Get follow-up response from the model
        const apiKey = deps.keyManager.getKey()
        if (apiKey) {
          const client = new OpenAI({ apiKey })
          const followUpId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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

    onChunk: createSubscription('agentChat:chunk'),
    onToolCall: createSubscription('agentChat:toolCall'),
    onToolCallUpdate: createSubscription('agentChat:toolCallUpdate'),
  })
}

async function streamCompletion(
  client: OpenAI,
  deps: AgentChatDeps,
  conversationId: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  messageId: string,
  abortController: AbortController,
) {
  const stream = client.chat.completions.stream(
    {
      model: 'gpt-4.1',
      messages,
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

    // Stream text content
    if (delta?.content) {
      fullContent += delta.content
      ee.emit('agentChat:chunk', {
        messageId,
        delta: delta.content,
        done: false,
      })
    }

    // Accumulate tool calls
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

    // Check if done
    if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
      break
    }
  }

  // Signal text streaming done
  ee.emit('agentChat:chunk', { messageId, delta: '', done: true })

  // Process tool calls if any
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
      const isReadOnly = READ_ONLY_TOOLS.includes(toolName)

      if (isReadOnly) {
        // Auto-approve read-only tools — emit as executing, run, emit result
        ee.emit('agentChat:toolCall', {
          messageId,
          toolCallId: tc.id,
          name: toolName,
          arguments: parsedArgs,
          status: 'executing',
        })
        autoApproveQueue.push({ id: tc.id, name: toolName, arguments: parsedArgs })
      } else {
        // Store as pending and emit to renderer for confirmation
        pendingToolCalls.set(tc.id, {
          conversationId,
          messageId,
          name: toolName,
          arguments: parsedArgs,
        })

        ee.emit('agentChat:toolCall', {
          messageId,
          toolCallId: tc.id,
          name: toolName,
          arguments: parsedArgs,
          status: 'pending_confirmation',
        })
      }
    }

    // Add assistant message with tool calls to conversation
    messages.push({
      role: 'assistant',
      content: fullContent || null,
      tool_calls: assistantToolCalls,
    })

    // Auto-execute read-only tools
    for (const autoTool of autoApproveQueue) {
      try {
        const result = await executeTool(deps, autoTool.name, autoTool.arguments)
        ee.emit('agentChat:toolCallUpdate', {
          toolCallId: autoTool.id,
          status: 'complete',
          result,
        })
        messages.push({
          role: 'tool',
          tool_call_id: autoTool.id,
          content: JSON.stringify(result),
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        ee.emit('agentChat:toolCallUpdate', {
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

    // If all tool calls were auto-approved (no pending confirmations), get follow-up
    const hasPending = toolCalls.size > autoApproveQueue.length
    if (!hasPending && autoApproveQueue.length > 0) {
      const followUpId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await streamCompletion(client, deps, conversationId, messages, followUpId, abortController)
    }
  } else {
    // Plain text response
    messages.push({
      role: 'assistant',
      content: fullContent,
    })
  }
}

