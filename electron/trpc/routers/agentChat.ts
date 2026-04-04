import { z } from 'zod'
import OpenAI from 'openai'
import { t } from '../trpc'
import { createSubscription } from '../helpers'
import { ee } from '../events'
import type { AgentChatKeyManager } from '../../agentChat/keyManager'
import type { PtyManager } from '../../ptyManager'
import type { AgentType } from '../../agents/types'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { READ_ONLY_TOOLS } from '../../../src/types/agentChat'
import type { AgentChatToolName } from '../../../src/types/agentChat'

interface AgentChatDeps {
  keyManager: AgentChatKeyManager
  settingsPath: string
  sessionsPath: string
  ptyManager: PtyManager
  spawnAgent: (name: string, cwd: string, agentType: AgentType) => Promise<{ id: string; pid: number; hookId: string }>
}

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

const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'List all known projects in the Tentacles platform',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_project',
      description: 'Switch to a specific project by its path',
      parameters: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'The full path of the project to open' },
        },
        required: ['projectPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_workspaces',
      description: 'List all workspaces (main + worktrees) for a project',
      parameters: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'The project path to list workspaces for' },
        },
        required: ['projectPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_workspace',
      description: 'Create a new git worktree workspace in a project',
      parameters: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'The project path to create the worktree in' },
          name: { type: 'string', description: 'Branch/worktree name (optional, auto-generated if omitted)' },
        },
        required: ['projectPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_session',
      description: 'Create a new agent coding session in a workspace. Requires a workspaceId — use list_workspaces first to find it.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'The workspace ID to create the session in (e.g., "main:/path/to/repo")' },
          name: { type: 'string', description: 'Name for the session (optional)' },
          agentType: { type: 'string', description: 'Type of agent (e.g., "claude"). Defaults to "claude"' },
        },
        required: ['workspaceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'List all active agent sessions',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_session',
      description: 'Close/terminate an agent session by its ID',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'The ID of the session to close' },
        },
        required: ['sessionId'],
      },
    },
  },
]

function readSettings(settingsPath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

function readSessionsFile(sessionsPath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
  } catch {
    return {}
  }
}

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

async function executeTool(
  deps: AgentChatDeps,
  name: AgentChatToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_projects': {
      const settings = readSettings(deps.settingsPath)
      const paths = (settings.projectPaths as string[]) ?? []
      return paths.map((p: string) => ({ path: p, name: nodePath.basename(p) }))
    }

    case 'open_project': {
      const projectPath = args.projectPath as string
      if (!projectPath) throw new Error('projectPath is required')
      const settings = readSettings(deps.settingsPath)
      const paths = (settings.projectPaths as string[]) ?? []
      if (!paths.includes(projectPath)) {
        throw new Error(`Project "${projectPath}" not found. Available: ${paths.join(', ')}`)
      }
      return { _rendererAction: 'open_project', projectPath }
    }

    case 'list_workspaces': {
      const projectPath = args.projectPath as string
      if (!projectPath) throw new Error('projectPath is required')
      const sessionsData = readSessionsFile(deps.sessionsPath)
      const workspaces = (sessionsData.workspaces ?? []) as Array<Record<string, unknown>>
      return workspaces
        .filter((ws) => ws.projectId === projectPath)
        .map((ws) => ({ id: ws.id, name: ws.name, type: ws.type, branch: ws.branch, status: ws.status }))
    }

    case 'create_workspace': {
      const projectPath = args.projectPath as string
      if (!projectPath) throw new Error('projectPath is required')
      return { _rendererAction: 'create_workspace', projectPath, name: args.name }
    }

    case 'create_session': {
      const workspaceId = args.workspaceId as string
      if (!workspaceId) throw new Error('workspaceId is required')
      return { _rendererAction: 'create_session', workspaceId, name: args.name, agentType: args.agentType ?? 'claude' }
    }

    case 'list_sessions': {
      const sessionsData = readSessionsFile(deps.sessionsPath)
      const sessions = (sessionsData.sessions ?? []) as Array<Record<string, unknown>>
      return sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        workspaceId: s.workspaceId,
        agentType: s.agentType,
        cwd: s.cwd,
      }))
    }

    case 'close_session': {
      const sessionId = args.sessionId as string
      if (!sessionId) throw new Error('sessionId is required')
      return { _rendererAction: 'close_session', sessionId }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
