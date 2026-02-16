# Tentacles — Claude Code Orchestrator

## Tech Stack
- **Runtime**: Electron 30 + React 18 + TypeScript
- **Build**: Vite + vite-plugin-electron
- **Styling**: Tailwind CSS v4
- **State**: Zustand (4 stores: session, fileTree, settings, notification)
- **Terminal**: @xterm/xterm + node-pty
- **Editor**: Monaco (read-only viewer via @monaco-editor/react)
- **File watching**: chokidar
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
- node-pty and chokidar are externalized from Vite's main process bundle
- Terminal instances persist across tab switches (hidden via `display:none`, never disposed)
