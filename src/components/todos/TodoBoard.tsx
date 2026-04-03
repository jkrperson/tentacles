import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useTodoStore } from '../../stores/todoStore'
import { TodoCard } from './TodoCard'
import { TodoDetail } from './TodoDetail'
import { TodoList } from './TodoList'
import type { TodoStatus, Todo } from '../../stores/todoStore'

const COLUMNS: { status: TodoStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: 'var(--t-text-muted, #71717a)' },
  { status: 'todo', label: 'Todo', color: 'var(--t-accent, #3b82f6)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--t-status-running, #f59e0b)' },
  { status: 'done', label: 'Done', color: 'var(--t-status-completed, #22c55e)' },
]

export function TodoBoard() {
  const todos = useTodoStore((s) => s.todos)
  const load = useTodoStore((s) => s.load)
  const loadProjects = useTodoStore((s) => s.loadProjects)
  const createTodo = useTodoStore((s) => s.createTodo)
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const selectedTodoId = useTodoStore((s) => s.selectedTodoId)
  const setSelectedTodoId = useTodoStore((s) => s.setSelectedTodoId)
  const viewMode = useTodoStore((s) => s.viewMode)
  const setViewMode = useTodoStore((s) => s.setViewMode)

  useEffect(() => {
    load()
    loadProjects()
  }, [load, loadProjects])

  const selectedTodo = useMemo(() => todos.find((t) => t.id === selectedTodoId) ?? null, [todos, selectedTodoId])

  // Only show top-level todos on the board (subtasks shown inside detail)
  const topLevelTodos = useMemo(() => todos.filter((t) => t.parent_id === null), [todos])

  const todosByStatus = useMemo(() => {
    const map: Record<TodoStatus, Todo[]> = { backlog: [], todo: [], in_progress: [], done: [] }
    for (const todo of topLevelTodos) {
      map[todo.status].push(todo)
    }
    return map
  }, [topLevelTodos])

  const handleDrop = useCallback((todoId: string, newStatus: TodoStatus) => {
    updateTodo(todoId, { status: newStatus })
  }, [updateTodo])

  return (
    <div className="flex h-full flex-col bg-[var(--t-bg-base)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-semibold text-zinc-200">Todos</h1>
          <span className="text-[11px] text-zinc-600">{topLevelTodos.length} items</span>
        </div>
        <div className="flex items-center gap-0.5 bg-[var(--t-bg-surface)] rounded p-0.5 border border-[var(--t-border)]">
          <ViewToggleButton active={viewMode === 'board'} onClick={() => setViewMode('board')} title="Board view">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
            </svg>
          </ViewToggleButton>
          <ViewToggleButton active={viewMode === 'list'} onClick={() => setViewMode('list')} title="List view">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
            </svg>
          </ViewToggleButton>
        </div>
      </div>

      {/* Board or List */}
      {viewMode === 'board' ? (
        <div className="flex-1 min-h-0 flex gap-3 p-4 overflow-x-auto">
          {COLUMNS.map((col) => (
            <TodoColumn
              key={col.status}
              status={col.status}
              label={col.label}
              color={col.color}
              todos={todosByStatus[col.status]}
              onCreateTodo={createTodo}
              onDrop={handleDrop}
              selectedTodoId={selectedTodoId}
              onSelectTodo={setSelectedTodoId}
            />
          ))}
        </div>
      ) : (
        <TodoList />
      )}

      {/* Detail panel */}
      {selectedTodo && (
        <TodoDetail
          todo={selectedTodo}
          onClose={() => setSelectedTodoId(null)}
        />
      )}
    </div>
  )
}

function TodoColumn({
  status,
  label,
  color,
  todos,
  onCreateTodo,
  onDrop,
  selectedTodoId,
  onSelectTodo,
}: {
  status: TodoStatus
  label: string
  color: string
  todos: Todo[]
  onCreateTodo: (title: string, status?: TodoStatus) => Promise<Todo>
  onDrop: (todoId: string, newStatus: TodoStatus) => void
  selectedTodoId: string | null
  onSelectTodo: (id: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const handleSubmit = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) {
      setAdding(false)
      return
    }
    await onCreateTodo(title, status)
    setNewTitle('')
    setAdding(false)
  }, [newTitle, status, onCreateTodo])

  return (
    <div
      className={`flex flex-col flex-shrink-0 w-[280px] rounded-lg transition-colors ${dragOver ? 'bg-[var(--t-bg-hover)]' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const todoId = e.dataTransfer.getData('text/plain')
        if (todoId) onDrop(todoId, status)
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-1">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[12px] font-medium text-zinc-300">{label}</span>
        <span className="text-[11px] text-zinc-600 ml-auto">{todos.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 px-1">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            isSelected={todo.id === selectedTodoId}
            onSelect={() => onSelectTodo(todo.id === selectedTodoId ? null : todo.id)}
          />
        ))}

        {/* Quick add */}
        {adding ? (
          <div className="px-1 py-1">
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
              className="w-full bg-[var(--t-bg-surface)] text-[12px] text-zinc-200 placeholder-zinc-600 border border-[var(--t-border)] rounded px-2 py-1.5 outline-none focus:border-[var(--t-accent)]/50"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 px-2 py-1.5 w-full transition-colors rounded hover:bg-[var(--t-bg-surface)]"
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

function ViewToggleButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        active ? 'bg-[var(--t-bg-hover)] text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
      }`}
    >
      {children}
    </button>
  )
}
