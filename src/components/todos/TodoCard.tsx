import type { Todo, TodoPriority } from '../../stores/todoStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

const PRIORITY_INDICATORS: Record<TodoPriority, { label: string; color: string } | null> = {
  none: null,
  low: { label: 'Low', color: '#3b82f6' },
  medium: { label: 'Med', color: '#f59e0b' },
  high: { label: 'High', color: '#f97316' },
  urgent: { label: 'Urgent', color: '#ef4444' },
}

export function TodoCard({ todo, isSelected, onSelect }: { todo: Todo; isSelected: boolean; onSelect: () => void }) {
  const workspace = useWorkspaceStore((s) => todo.workspace_id ? s.workspaces.get(todo.workspace_id) : undefined)
  const priority = PRIORITY_INDICATORS[todo.priority]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', todo.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onSelect}
      className={`px-3 py-2 rounded-md border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-[var(--t-bg-hover)] border-[var(--t-accent)]/40'
          : 'bg-[var(--t-bg-surface)] border-[var(--t-border)] hover:border-[var(--t-border-hover,var(--t-border))]'
      }`}
    >
      <div className="text-[12px] text-zinc-200 leading-snug">{todo.title}</div>

      {(priority || workspace) && (
        <div className="flex items-center gap-2 mt-1.5">
          {priority && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: priority.color, backgroundColor: `${priority.color}15` }}>
              {priority.label}
            </span>
          )}
          {workspace && (
            <span className="text-[10px] text-zinc-500 truncate max-w-[140px]" title={workspace.name}>
              {workspace.name}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
