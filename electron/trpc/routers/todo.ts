import { z } from 'zod'
import { t } from '../trpc'
import {
  listTodoProjects, createTodoProject, updateTodoProject, deleteTodoProject,
  listTodos, getTodo, createTodo, updateTodo, deleteTodo,
} from '../../db/todoDb'
import type { TodoStatus, TodoPriority } from '../../db/todoDb'

const todoStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done'])
const todoPrioritySchema = z.enum(['none', 'low', 'medium', 'high', 'urgent'])

export function createTodoRouter() {
  return t.router({
    // --- Projects ---
    listProjects: t.procedure
      .query(() => listTodoProjects()),

    createProject: t.procedure
      .input(z.object({ id: z.string(), name: z.string() }))
      .mutation(({ input }) => createTodoProject(input.id, input.name)),

    updateProject: t.procedure
      .input(z.object({ id: z.string(), name: z.string() }))
      .mutation(({ input }) => updateTodoProject(input.id, input.name)),

    deleteProject: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => deleteTodoProject(input.id)),

    // --- Todos ---
    list: t.procedure
      .input(z.object({
        projectId: z.string().optional(),
        status: todoStatusSchema.optional(),
        parentId: z.string().nullable().optional(),
      }).optional())
      .query(({ input }) => listTodos(input ? {
        projectId: input.projectId,
        status: input.status as TodoStatus | undefined,
        parentId: input.parentId,
      } : undefined)),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => getTodo(input.id) ?? null),

    create: t.procedure
      .input(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        status: todoStatusSchema.optional(),
        priority: todoPrioritySchema.optional(),
        projectId: z.string().optional(),
        parentId: z.string().optional(),
        workspaceId: z.string().optional(),
        repoPath: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input }) => createTodo({
        ...input,
        priority: input.priority as TodoPriority | undefined,
        status: input.status as TodoStatus | undefined,
      })),

    update: t.procedure
      .input(z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        status: todoStatusSchema.optional(),
        priority: todoPrioritySchema.optional(),
        projectId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        workspaceId: z.string().nullable().optional(),
        repoPath: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input }) => updateTodo({
        ...input,
        priority: input.priority as TodoPriority | undefined,
        status: input.status as TodoStatus | undefined,
      })),

    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => deleteTodo(input.id)),
  })
}
