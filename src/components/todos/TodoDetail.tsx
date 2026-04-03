import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTodoStore } from '../../stores/todoStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Todo, TodoStatus, TodoPriority } from '../../stores/todoStore'

const STATUS_OPTIONS: { value: TodoStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export function TodoDetail({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const deleteTodo = useTodoStore((s) => s.deleteTodo)
  const createTodo = useTodoStore((s) => s.createTodo)
  const todos = useTodoStore((s) => s.todos)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const projects = useProjectStore((s) => s.projects)

  const subtasks = useMemo(() => todos.filter((t) => t.parent_id === todo.id), [todos, todo.id])

  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description ?? '')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const subtaskRef = useRef<HTMLInputElement>(null)

  // Sync when todo changes
  useEffect(() => {
    setTitle(todo.title)
    setDescription(todo.description ?? '')
  }, [todo.id, todo.title, todo.description])

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (addingSubtask) subtaskRef.current?.focus()
  }, [addingSubtask])

  const saveTitle = useCallback(() => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== todo.title) {
      updateTodo(todo.id, { title: trimmed })
    } else {
      setTitle(todo.title)
    }
    setEditingTitle(false)
  }, [title, todo.id, todo.title, updateTodo])

  const saveDescription = useCallback(() => {
    const val = description.trim() || null
    if (val !== todo.description) {
      updateTodo(todo.id, { description: val })
    }
  }, [description, todo.id, todo.description, updateTodo])

  const handleAddSubtask = useCallback(async () => {
    const trimmed = subtaskTitle.trim()
    if (trimmed) {
      await createTodo(trimmed, todo.status, { parentId: todo.id })
    }
    setSubtaskTitle('')
    setAddingSubtask(false)
  }, [subtaskTitle, todo.id, todo.status, createTodo])

  const handleDelete = useCallback(() => {
    deleteTodo(todo.id)
    onClose()
  }, [todo.id, deleteTodo, onClose])

  // Build workspace options from available workspaces
  const workspaceOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    workspaces.forEach((ws) => {
      const project = projects.get(ws.projectId)
      const projectName = project ? project.name : ws.projectId.split('/').pop()
      opts.push({ value: ws.id, label: `${projectName} / ${ws.name}` })
    })
    return opts
  }, [workspaces, projects])

  return (
    <div className="border-t border-[var(--t-border)] bg-[var(--t-bg-surface)] flex-shrink-0 max-h-[50%] overflow-y-auto">
      <div className="px-5 py-4 space-y-4">
        {/* Title + close */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(todo.title); setEditingTitle(false) } }}
                className="w-full bg-transparent text-[14px] font-semibold text-zinc-200 outline-none border-b border-[var(--t-accent)]/50 pb-0.5"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-[14px] font-semibold text-zinc-200 cursor-text hover:text-zinc-100 transition-colors"
              >
                {todo.title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDelete}
              className="text-zinc-600 hover:text-red-400 p-1 transition-colors"
              title="Delete todo"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-zinc-600 hover:text-zinc-300 p-1 transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Fields row */}
        <div className="flex items-center gap-4 flex-wrap">
          <Field label="Status">
            <select
              value={todo.status}
              onChange={(e) => updateTodo(todo.id, { status: e.target.value as TodoStatus })}
              className="bg-[var(--t-bg-base)] text-[11px] text-zinc-300 border border-[var(--t-border)] rounded px-1.5 py-1 outline-none"
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Priority">
            <select
              value={todo.priority}
              onChange={(e) => updateTodo(todo.id, { priority: e.target.value as TodoPriority })}
              className="bg-[var(--t-bg-base)] text-[11px] text-zinc-300 border border-[var(--t-border)] rounded px-1.5 py-1 outline-none"
            >
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Workspace">
            <select
              value={todo.workspace_id ?? ''}
              onChange={(e) => updateTodo(todo.id, { workspace_id: e.target.value || null })}
              className="bg-[var(--t-bg-base)] text-[11px] text-zinc-300 border border-[var(--t-border)] rounded px-1.5 py-1 outline-none max-w-[200px]"
            >
              <option value="">None</option>
              {workspaceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="Add a description..."
            rows={3}
            className="w-full bg-[var(--t-bg-base)] text-[12px] text-zinc-300 placeholder-zinc-600 border border-[var(--t-border)] rounded px-2 py-1.5 outline-none resize-y focus:border-[var(--t-accent)]/50"
          />
        </div>

        {/* Subtasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Subtasks</label>
            <button
              onClick={() => setAddingSubtask(true)}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              + Add
            </button>
          </div>

          <div className="space-y-1">
            {subtasks.map((sub) => (
              <SubtaskRow key={sub.id} subtask={sub} />
            ))}
            {addingSubtask && (
              <input
                ref={subtaskRef}
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubtask()
                  if (e.key === 'Escape') { setAddingSubtask(false); setSubtaskTitle('') }
                }}
                onBlur={handleAddSubtask}
                placeholder="Subtask title..."
                className="w-full bg-[var(--t-bg-base)] text-[12px] text-zinc-200 placeholder-zinc-600 border border-[var(--t-border)] rounded px-2 py-1.5 outline-none focus:border-[var(--t-accent)]/50"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function SubtaskRow({ subtask }: { subtask: Todo }) {
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const deleteTodo = useTodoStore((s) => s.deleteTodo)
  const isDone = subtask.status === 'done'

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--t-bg-hover)] group">
      <button
        onClick={() => updateTodo(subtask.id, { status: isDone ? 'todo' : 'done' })}
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
      <span className={`text-[12px] flex-1 ${isDone ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{subtask.title}</span>
      <button
        onClick={() => deleteTodo(subtask.id)}
        className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  )
}
