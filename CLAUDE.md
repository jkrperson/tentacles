# Tentacles — Claude Code Orchestrator

**Linear Project**: [Tentacles](https://linear.app/heyeva/project/tentacles-f94a79714103)

## Tech Stack
- **Runtime**: Electron 30 + React 18 + TypeScript
- **Build**: Vite + vite-plugin-electron
- **Styling**: Tailwind CSS v4
- **State**: Zustand (4 stores: session, fileTree, settings, notification)
- **Terminal**: @xterm/xterm + node-pty
- **Editor**: Monaco (read-only viewer via @monaco-editor/react)
- **File watching**: native `fs.watch({ recursive: true })`
- **Package manager**: bun

## Project Structure
```
electron/          # Main process (main.ts, preload.ts, ptyManager.ts, fileWatcher.ts)
src/
  components/      # React components (terminal/, sessions/, sidebar/, editor/, notifications/, settings/)
  hooks/           # Custom hooks (useTerminal.ts)
  stores/          # Zustand stores
  types/           # TypeScript types
```

## Commands
- `bun run dev` — Start dev server + Electron
- `bun run build` — Production build + package

## Conventions
- Use `import type` in preload scripts (erased at compile time)
- IPC channels follow `domain:action` naming (e.g., `session:create`, `file:readDir`)
- All IPC listeners return unsubscribe functions
- node-pty and ws are externalized from Vite's main process bundle
- Terminal instances persist across tab switches (hidden via `display:none`, never disposed)

## Best Practices

### Electron
- Keep the main process lean — offload heavy work to utility processes or the renderer
- Never expose full `ipcMain`/`ipcRenderer` directly; use contextBridge with a typed preload API
- Minimize IPC payloads; avoid sending large buffers or entire file contents when a path suffices
- Always validate and sanitize data received over IPC in the main process
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
