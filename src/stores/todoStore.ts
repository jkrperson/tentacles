import { create } from 'zustand'
import { trpc } from '../trpc'

export type TodoStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface Todo {
  id: string
  project_id: string | null
  parent_id: string | null
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  workspace_id: string | null
  repo_path: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TodoProject {
  id: string
  name: string
  created_at: string
}

export type TodoViewMode = 'board' | 'list'

interface TodoState {
  todos: Todo[]
  projects: TodoProject[]
  selectedTodoId: string | null
  viewMode: TodoViewMode
  loading: boolean

  load: () => Promise<void>
  loadProjects: () => Promise<void>

  createTodo: (title: string, status?: TodoStatus, opts?: { projectId?: string; parentId?: string; description?: string }) => Promise<Todo>
  updateTodo: (id: string, updates: Partial<Pick<Todo, 'title' | 'description' | 'status' | 'priority' | 'project_id' | 'parent_id' | 'workspace_id' | 'repo_path' | 'sort_order'>>) => Promise<Todo>
  deleteTodo: (id: string) => Promise<void>

  createProject: (name: string) => Promise<TodoProject>
  updateProject: (id: string, name: string) => Promise<TodoProject>
  deleteProject: (id: string) => Promise<void>

  setSelectedTodoId: (id: string | null) => void
  setViewMode: (mode: TodoViewMode) => void
}

function generateId(): string {
  return crypto.randomUUID()
}

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  projects: [],
  selectedTodoId: null,
  viewMode: 'board',
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const todos = await trpc.todo.list.query()
      set({ todos: todos as Todo[] })
    } finally {
      set({ loading: false })
    }
  },

  loadProjects: async () => {
    const projects = await trpc.todo.listProjects.query()
    set({ projects: projects as TodoProject[] })
  },

  createTodo: async (title, status = 'backlog', opts) => {
    const id = generateId()
    const todo = await trpc.todo.create.mutate({
      id,
      title,
      status,
      projectId: opts?.projectId,
      parentId: opts?.parentId,
      description: opts?.description,
    }) as Todo
    set((s) => ({ todos: [...s.todos, todo] }))
    return todo
  },

  updateTodo: async (id, updates) => {
    const mapped: Record<string, unknown> = { id }
    if (updates.title !== undefined) mapped.title = updates.title
    if (updates.description !== undefined) mapped.description = updates.description
    if (updates.status !== undefined) mapped.status = updates.status
    if (updates.priority !== undefined) mapped.priority = updates.priority
    if (updates.project_id !== undefined) mapped.projectId = updates.project_id
    if (updates.parent_id !== undefined) mapped.parentId = updates.parent_id
    if (updates.workspace_id !== undefined) mapped.workspaceId = updates.workspace_id
    if (updates.repo_path !== undefined) mapped.repoPath = updates.repo_path
    if (updates.sort_order !== undefined) mapped.sortOrder = updates.sort_order

    const updated = await trpc.todo.update.mutate(mapped as Parameters<typeof trpc.todo.update.mutate>[0]) as Todo
    set((s) => ({ todos: s.todos.map((t) => t.id === id ? updated : t) }))
    return updated
  },

  deleteTodo: async (id) => {
    await trpc.todo.delete.mutate({ id })
    set((s) => ({
      todos: s.todos.filter((t) => t.id !== id),
      selectedTodoId: s.selectedTodoId === id ? null : s.selectedTodoId,
    }))
  },

  createProject: async (name) => {
    const id = generateId()
    const project = await trpc.todo.createProject.mutate({ id, name }) as TodoProject
    set((s) => ({ projects: [...s.projects, project] }))
    return project
  },

  updateProject: async (id, name) => {
    const updated = await trpc.todo.updateProject.mutate({ id, name }) as TodoProject
    set((s) => ({ projects: s.projects.map((p) => p.id === id ? updated : p) }))
    return updated
  },

  deleteProject: async (id) => {
    await trpc.todo.deleteProject.mutate({ id })
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  },

  setSelectedTodoId: (id) => set({ selectedTodoId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))
