import { z } from 'zod'
import { t } from '../trpc'
import type { GitManager } from '../../gitManager'

interface GitDeps {
  gitManager: GitManager
}

export function createGitRouter(deps: GitDeps) {
  return t.router({
    isRepo: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.isRepo(input.dirPath)
      }),

    status: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.status(input.dirPath)
      }),

    discardChanges: t.procedure
      .input(z.object({ repoPath: z.string(), paths: z.array(z.string()), statuses: z.array(z.string()) }))
      .mutation(({ input }) => {
        return deps.gitManager.discardChanges(input.repoPath, input.paths, input.statuses)
      }),

    stage: t.procedure
      .input(z.object({ repoPath: z.string(), paths: z.array(z.string()) }))
      .mutation(({ input }) => {
        return deps.gitManager.stage(input.repoPath, input.paths)
      }),

    unstage: t.procedure
      .input(z.object({ repoPath: z.string(), paths: z.array(z.string()) }))
      .mutation(({ input }) => {
        return deps.gitManager.unstage(input.repoPath, input.paths)
      }),

    commit: t.procedure
      .input(z.object({ repoPath: z.string(), message: z.string() }))
      .mutation(({ input }) => {
        return deps.gitManager.commit(input.repoPath, input.message)
      }),

    push: t.procedure
      .input(z.object({ repoPath: z.string() }))
      .mutation(({ input }) => {
        return deps.gitManager.push(input.repoPath)
      }),

    pull: t.procedure
      .input(z.object({ repoPath: z.string() }))
      .mutation(({ input }) => {
        return deps.gitManager.pull(input.repoPath)
      }),

    branches: t.procedure
      .input(z.object({ repoPath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.listBranches(input.repoPath)
      }),

    switchBranch: t.procedure
      .input(z.object({ repoPath: z.string(), branch: z.string() }))
      .mutation(({ input }) => {
        return deps.gitManager.switchBranch(input.repoPath, input.branch)
      }),

    createBranch: t.procedure
      .input(z.object({ repoPath: z.string(), name: z.string(), checkout: z.boolean().optional() }))
      .mutation(({ input }) => {
        return deps.gitManager.createBranch(input.repoPath, input.name, input.checkout)
      }),

    stash: t.procedure
      .input(z.object({ repoPath: z.string(), message: z.string().optional() }))
      .mutation(({ input }) => {
        return deps.gitManager.stash(input.repoPath, input.message)
      }),

    stashPop: t.procedure
      .input(z.object({ repoPath: z.string() }))
      .mutation(({ input }) => {
        return deps.gitManager.stashPop(input.repoPath)
      }),

    showFile: t.procedure
      .input(z.object({ repoPath: z.string(), ref: z.string(), filePath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.showFile(input.repoPath, input.ref, input.filePath)
      }),

    diffStats: t.procedure
      .input(z.object({ dirPath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.diffStats(input.dirPath)
      }),

    diffNumstat: t.procedure
      .input(z.object({ repoPath: z.string() }))
      .query(({ input }) => {
        return deps.gitManager.diffNumstat(input.repoPath)
      }),

    amendCommit: t.procedure
      .input(z.object({ repoPath: z.string(), message: z.string().optional() }))
      .mutation(({ input }) => {
        return deps.gitManager.amendCommit(input.repoPath, input.message)
      }),

    worktree: t.router({
      create: t.procedure
        .input(z.object({ repoPath: z.string(), name: z.string().optional() }))
        .mutation(({ input }) => {
          return deps.gitManager.createWorktree(input.repoPath, input.name)
        }),

      remove: t.procedure
        .input(z.object({ repoPath: z.string(), worktreePath: z.string(), branch: z.string().optional() }))
        .mutation(({ input }) => {
          return deps.gitManager.removeWorktree(input.repoPath, input.worktreePath, input.branch)
        }),

      list: t.procedure
        .input(z.object({ repoPath: z.string() }))
        .query(({ input }) => {
          return deps.gitManager.listWorktrees(input.repoPath)
        }),
    }),
  })
}
