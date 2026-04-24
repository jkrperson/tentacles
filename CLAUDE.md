# Tentacles — Claude Code Orchestrator

**Linear Project**: [Tentacles](https://linear.app/heyeva/project/tentacles-f94a79714103)

## Tech Stack
- **Runtime**: Electron 30 + React 18 + TypeScript
- **Build**: Vite + vite-plugin-electron
- **IPC**: tRPC (electron-trpc) — end-to-end type-safe main↔renderer communication
- **Styling**: Tailwind CSS v4
- **State**: Zustand (4 stores: session, fileTree, settings, notification)
- **Terminal**: @xterm/xterm + node-pty
- **Editor**: Monaco (read-only viewer via @monaco-editor/react)
- **File watching**: native `fs.watch({ recursive: true })`
- **Package manager**: bun

## Project Structure
```
electron/          # Main process (main.ts, preload.ts, ptyManager.ts, fileWatcher.ts)
  trpc/            # tRPC router infrastructure
    trpc.ts        # tRPC init
    events.ts      # Typed EventEmitter for main→renderer events
    router.ts      # Root AppRouter (combines all domain routers)
    routers/       # Per-domain routers (session, terminal, file, git, dialog, lsp, updater, app)
src/
  trpc.ts          # Renderer-side tRPC proxy client
  components/      # React components (terminal/, sessions/, sidebar/, editor/, notifications/, settings/)
  hooks/           # Custom hooks (useTerminal.ts)
  stores/          # Zustand stores
  types/           # TypeScript types
```

## Commands
- `bun run dev` — Start dev server + Electron
- `bun run build` — Production build + package

## Conventions
- IPC uses tRPC via `electron-trpc` — types flow from router definitions to renderer callsites
- Queries for read operations (`trpc.git.status.query({...})`), mutations for writes (`trpc.session.create.mutate({...})`)
- Subscriptions for main→renderer events (`trpc.session.onData.subscribe(undefined, { onData: cb })`)
- Main process emits events via typed EventEmitter (`ee.emit`); tRPC subscriptions listen to `ee`
- Router procedures use named object inputs (e.g., `{ repoPath, branch }`) — no positional args
- node-pty, ws, and electron-trpc are externalized from Vite's main process bundle
- Terminal instances persist across tab switches (hidden via `display:none`, never disposed)

## Best Practices

### Electron / tRPC
- Keep the main process lean — offload heavy work to utility processes or the renderer
- Add new IPC by creating procedures in the appropriate `electron/trpc/routers/*.ts` file — types auto-propagate
- Use zod schemas for input validation on all procedures
- For new main→renderer events: add to `electron/trpc/events.ts` EventMap, emit via `ee`, create a subscription procedure
- Router factory functions receive dependencies (managers, etc.) — no module-level singletons in router files
- Avoid `nodeIntegration: true` and `contextIsolation: false` — use the preload bridge pattern

### React
- Prefer functional components with hooks; avoid class components
- Keep components small and focused — split when a component handles multiple concerns
- Colocate state as close to where it's used as possible; lift to Zustand stores only for shared state
- Memoize expensive computations with `useMemo` and stable callbacks with `useCallback` only when needed (measured perf issue or referential equality matters)
- Avoid inline object/array literals in props that cause unnecessary re-renders
- Use React.lazy + Suspense for code-splitting heavy components (e.g., Monaco editor)

### Builds
- Run `bun run build` (`tsc && vite build && electron-builder`) to verify the full pipeline before releases
- Keep native dependencies (node-pty) externalized in Vite config to avoid bundling issues
- Ensure `electron-rebuild` runs after installing/updating native modules (`bun run postinstall`)
- Test packaged builds on target platforms — dev mode can mask missing assets or incorrect paths

## Verification
After major changes, always run linting and typechecking to catch issues early:
- `bun run lint` — ESLint with TypeScript rules (zero warnings enforced)
- `bun run typecheck` — Full TypeScript type check without emitting files
