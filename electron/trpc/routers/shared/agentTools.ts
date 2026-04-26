import type OpenAI from 'openai'
import type { PtyManager } from '../../../ptyManager'
import type { AgentChatKeyManager } from '../../../agentChat/keyManager'
import type { AgentType } from '../../../agents/types'
import type { AgentChatToolName } from '../../../../src/types/agentChat'
import type { DaemonClient } from '../../../daemon/client'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'

export interface AgentToolDeps {
  keyManager: AgentChatKeyManager
  settingsPath: string
  ptyManager: PtyManager
  daemonClient: DaemonClient
  spawnAgent: (name: string, cwd: string, workspaceId: string, agentType: AgentType) => Promise<{ id: string; pid: number; hookId: string }>
}

export function readSettings(settingsPath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

export async function executeTool(
  deps: AgentToolDeps,
  name: AgentChatToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_projects': {
      const projects = await deps.daemonClient.listProjects()
      return projects.map((p) => ({ path: p.path, name: nodePath.basename(p.path) }))
    }

    case 'open_project': {
      const projectPath = args.projectPath as string
      if (!projectPath) throw new Error('projectPath is required')
      const projects = await deps.daemonClient.listProjects()
      const paths = projects.map((p) => p.path)
      if (!paths.includes(projectPath)) {
        throw new Error(`Project "${projectPath}" not found. Available: ${paths.join(', ')}`)
      }
      return { _rendererAction: 'open_project', projectPath }
    }

    case 'list_workspaces': {
      const projectPath = args.projectPath as string
      if (!projectPath) throw new Error('projectPath is required')
      const workspaces = await deps.daemonClient.listWorkspaces(projectPath)
      return workspaces.map((ws) => ({ id: ws.id, name: ws.name, type: ws.type, branch: ws.branch, status: ws.status }))
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
      const sessions = await deps.daemonClient.list()
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
