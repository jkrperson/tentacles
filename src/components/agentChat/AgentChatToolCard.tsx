import { useState } from 'react'
import type { AgentChatToolCall } from '../../types/agentChat'

interface AgentChatToolCardProps {
  toolCall: AgentChatToolCall
  onConfirm: (toolCallId: string, approved: boolean) => void
}

const TOOL_LABELS: Record<string, string> = {
  list_projects: 'List Projects',
  open_project: 'Open Project',
  create_session: 'Create Session',
  list_sessions: 'List Sessions',
  close_session: 'Close Session',
  list_workspaces: 'List Workspaces',
  create_workspace: 'Create Workspace',
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
}

function formatResult(result: unknown): string {
  if (Array.isArray(result)) {
    return result.map((r) => {
      if (typeof r === 'object' && r !== null) {
        return Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(', ')
      }
      return String(r)
    }).join('\n')
  }
  if (typeof result === 'object' && result !== null) {
    return Object.entries(result).map(([k, v]) => `${k}: ${v}`).join('\n')
  }
  return String(result)
}

export function AgentChatToolCard({ toolCall, onConfirm }: AgentChatToolCardProps) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name
  const hasArgs = Object.keys(toolCall.arguments).length > 0

  if (toolCall.status === 'streaming') {
    return (
      <div className="my-2 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3 animate-pulse">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          <span>{label}</span>
        </div>
      </div>
    )
  }

  if (toolCall.status === 'pending_confirmation') {
    return (
      <div className="my-2 rounded-lg border border-[var(--t-accent)]/40 bg-[var(--t-accent)]/5 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--t-text-primary)] mb-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--t-accent)]">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.5 3h1v5h-1V4zm0 6h1v1h-1v-1z" />
          </svg>
          {label}
        </div>
        {hasArgs && (
          <pre className="text-xs text-zinc-400 mb-3 whitespace-pre-wrap font-mono">{formatArgs(toolCall.arguments)}</pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(toolCall.id, true)}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--t-accent)] text-white hover:opacity-90 transition-opacity"
          >
            Approve
          </button>
          <button
            onClick={() => onConfirm(toolCall.id, false)}
            className="px-3 py-1.5 text-xs rounded-md bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Deny
          </button>
        </div>
      </div>
    )
  }

  if (toolCall.status === 'executing') {
    return (
      <div className="my-2 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          <span>Executing {label}...</span>
        </div>
      </div>
    )
  }

  if (toolCall.status === 'complete') {
    return (
      <div className="my-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm text-green-400 w-full text-left"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.5 12.5l-4-4 1.4-1.4L6.5 9.7l5.6-5.6 1.4 1.4z" />
          </svg>
          <span>{label}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        {expanded && toolCall.result != null && (
          <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap font-mono border-t border-[var(--t-border)] pt-2">
            {formatResult(toolCall.result)}
          </pre>
        )}
      </div>
    )
  }

  if (toolCall.status === 'error') {
    return (
      <div className="my-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.5 3.1L3.1 4.5 6.6 8l-3.5 3.5 1.4 1.4L8 9.4l3.5 3.5 1.4-1.4L9.4 8l3.5-3.5-1.4-1.4L8 6.6 4.5 3.1z" />
          </svg>
          <span>{label} failed</span>
        </div>
        {toolCall.error && (
          <p className="mt-1 text-xs text-red-400/70">{String(toolCall.error)}</p>
        )}
      </div>
    )
  }

  return null
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
    </svg>
  )
}
