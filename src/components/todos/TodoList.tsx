import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useTodoStore } from '../../stores/todoStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import type { Todo, TodoStatus, TodoPriority } from '../../stores/todoStore'

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'var(--t-text-muted, #71717a)' },
  todo: { label: 'Todo', color: 'var(--t-accent, #3b82f6)' },
  in_progress: { label: 'In Progress', color: 'var(--t-status-running, #f59e0b)' },
  done: { label: 'Done', color: 'var(--t-status-completed, #22c55e)' },
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string } | null> = {
  none: null,
  low: { label: 'Low', color: '#3b82f6' },
  medium: { label: 'Med', color: '#f59e0b' },
  high: { label: 'High', color: '#f97316' },
  urgent: { label: 'Urgent', color: '#ef4444' },
}

type SortField = 'status' | 'priority' | 'title' | 'updated_at'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<TodoStatus, number> = { backlog: 0, todo: 1, in_progress: 2, done: 3 }
const PRIORITY_ORDER: Record<TodoPriority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 }

export function TodoList() {
  const todos = useTodoStore((s) => s.todos)
  const selectedTodoId = useTodoStore((s) => s.selectedTodoId)
  const setSelectedTodoId = useTodoStore((s) => s.setSelectedTodoId)
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const createTodo = useTodoStore((s) => s.createTodo)

  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const topLevelTodos = useMemo(() => todos.filter((t) => t.parent_id === null), [todos])

  const sorted = useMemo(() => {
    const arr = [...topLevelTodos]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          break
        case 'priority':
          cmp = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
          break
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'updated_at':
          cmp = a.updated_at.localeCompare(b.updated_at)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [topLevelTodos, sortField, sortDir])

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
      } else {
        setSortDir('asc')
      }
      return field
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    const title = newTitle.trim()
    if (title) await createTodo(title)
    setNewTitle('')
    setAdding(false)
  }, [newTitle, createTodo])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="ml-1 inline-block">
        {sortDir === 'asc'
          ? <path d="M8 4l4 5H4z" />
          : <path d="M8 12l4-5H4z" />}
      </svg>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Table header */}
      <div className="flex items-center border-b border-[var(--t-border)] text-[10px] text-zinc-500 uppercase tracking-wide px-4 flex-shrink-0">
        <button
          onClick={() => handleSort('title')}
          className="flex-1 min-w-0 text-left py-2 hover:text-zinc-300 transition-colors"
        >
          Title<SortIcon field="title" />
        </button>
        <button
          onClick={() => handleSort('status')}
          className="w-[110px] flex-shrink-0 text-left py-2 hover:text-zinc-300 transition-colors"
        >
          Status<SortIcon field="status" />
        </button>
        <button
          onClick={() => handleSort('priority')}
          className="w-[90px] flex-shrink-0 text-left py-2 hover:text-zinc-300 transition-colors"
        >
          Priority<SortIcon field="priority" />
        </button>
        <div className="w-[140px] flex-shrink-0 text-left py-2">Workspace</div>
        <button
          onClick={() => handleSort('updated_at')}
          className="w-[100px] flex-shrink-0 text-left py-2 hover:text-zinc-300 transition-colors"
        >
          Updated<SortIcon field="updated_at" />
        </button>
      </div>

      {/* Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sorted.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            isSelected={todo.id === selectedTodoId}
            onSelect={() => setSelectedTodoId(todo.id === selectedTodoId ? null : todo.id)}
            onStatusChange={(status) => updateTodo(todo.id, { status })}
          />
        ))}

        {/* Add row */}
        {adding ? (
          <div className="px-4 py-2 border-b border-[var(--t-border)]">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
                if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
              }}
              onBlur={handleSubmit}
              placeholder="Todo title..."
              className="w-full bg-transparent text-[12px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 px-4 py-2 w-full transition-colors hover:bg-[var(--t-bg-surface)]"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            Add todo
          </button>
        )}
      </div>
    </div>
  )
}

function TodoRow({
  todo,
  isSelected,
  onSelect,
  onStatusChange,
}: {
  todo: Todo
  isSelected: boolean
  onSelect: () => void
  onStatusChange: (status: TodoStatus) => void
}) {
  const workspace = useWorkspaceStore((s) => todo.workspace_id ? s.workspaces.get(todo.workspace_id) : undefined)
  const statusCfg = STATUS_CONFIG[todo.status]
  const priorityCfg = PRIORITY_CONFIG[todo.priority]
  const isDone = todo.status === 'done'

  const updatedLabel = useMemo(() => {
    const d = new Date(todo.updated_at)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }, [todo.updated_at])

  return (
    <div
      onClick={onSelect}
      className={`flex items-center px-4 py-2 border-b border-[var(--t-border)] cursor-pointer transition-colors ${
        isSelected
          ? 'bg-[var(--t-bg-hover)] border-l-2 border-l-[var(--t-accent)]'
          : 'hover:bg-[var(--t-bg-surface)] border-l-2 border-l-transparent'
      }`}
    >
      {/* Checkbox + title */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(isDone ? 'todo' : 'done') }}
          className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            isDone ? 'bg-[var(--t-status-completed,#22c55e)] border-[var(--t-status-completed,#22c55e)]' : 'border-zinc-600 hover:border-zinc-400'
          }`}
        >
          {isDone && (
            <svg width="8" height="8" viewBox="0 0 16 16" fill="white">
              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
            </svg>
          )}
        </button>
        <span className={`text-[12px] truncate ${isDone ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
          {todo.title}
        </span>
      </div>

      {/* Status */}
      <div className="w-[110px] flex-shrink-0">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ color: statusCfg.color, backgroundColor: `${statusCfg.color}15` }}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* Priority */}
      <div className="w-[90px] flex-shrink-0">
        {priorityCfg && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ color: priorityCfg.color, backgroundColor: `${priorityCfg.color}15` }}
          >
            {priorityCfg.label}
          </span>
        )}
      </div>

      {/* Workspace */}
      <div className="w-[140px] flex-shrink-0">
        {workspace && (
          <span className="text-[10px] text-zinc-500 truncate block" title={workspace.name}>
            {workspace.name}
          </span>
        )}
      </div>

      {/* Updated */}
      <div className="w-[100px] flex-shrink-0">
        <span className="text-[10px] text-zinc-600">{updatedLabel}</span>
      </div>
    </div>
  )
}
