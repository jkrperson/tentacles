# Tentacles — Next Steps

## 3. Save Sessions (Project Persistence)
**Priority**: Medium
**Status**: Not started

### Current Issues
- Projects are persisted (paths saved in `settings.json` via `settingsStore`).
- Sessions are **not persisted** — `sessionStore` is in-memory only. App restart = all sessions gone.
- File tree cache is also in-memory only.

### Approach
- **Persist project state, not agent state**: Save which projects are open and their file tree cache state (expanded paths, selected file). Do NOT persist agent sessions yet (that's a separate epic).
- **Storage location**: Use Electron's `userData` path alongside `settings.json`. Either extend `settings.json` or create a `projects.json` file.
- **What to save per project**:
  - `path` (already saved)
  - `expandedPaths` from file tree cache
  - `selectedFilePath`
  - `activeProjectId` (which project was last active)
- **Load on startup**: `projectStore.loadProjects()` already exists — extend it to restore tree state from disk.
- **Save triggers**: Debounced save on any project state change (expand/collapse, file select, project switch). Use `zustand/middleware` subscribe or a manual debounce.

### Files to Touch
- `src/stores/projectStore.ts` — serialize/deserialize project state
- `src/stores/settingsStore.ts` — possibly extend with project-specific settings
- `electron/main.ts` — IPC for reading/writing project state file

---

## 6. Git Tracking in Right Sidebar (Source Control Tab)
**Priority**: Medium
**Status**: In progress

### Goal
Add a Cursor/VS Code-style source control tab in the right sidebar. Users should see git status, staged/unstaged changes, diffs, and be able to perform basic git operations — all scoped to the active project.

### Current State
- Source Control tab has been added to the right sidebar.
- Git status display is functional (branch, staged, unstaged, untracked files).
- **Remaining**: Source control actions (stage, unstage, commit, push, pull) have not been implemented yet.
- `fileWatcher.ts` already ignores `.git/` directories.

### Approach
- **Git backend**: Use `simple-git` (lightweight Node.js git wrapper) in the main process. Avoids shelling out manually and handles parsing. Alternatively, raw `child_process.execFile('git', ...)` calls keep dependencies minimal — but `simple-git` is more ergonomic for status/diff/log.
- **Right sidebar tabs**: Add a tab bar to the right sidebar with two tabs — **Files** (existing file tree) and **Source Control** (new). Use a simple tab state in the sidebar component.
- **Git state per project**: Each project tracks its own git state. Store in `projectStore` or a dedicated `gitStore`:
  - `branch`: current branch name
  - `ahead`/`behind`: commits ahead/behind remote
  - `staged`: list of staged file paths + status (added/modified/deleted)
  - `unstaged`: list of unstaged changes
  - `untracked`: list of untracked files
- **Source Control panel UI** (similar to Cursor):
  - **Branch indicator** at top (current branch, ahead/behind counts)
  - **Staged Changes** section — collapsible list of staged files with status badges (A/M/D)
  - **Changes** section — collapsible list of unstaged modified/deleted files
  - **Untracked Files** section — collapsible list
  - **Actions**: Stage/unstage individual files (click), stage all, commit (inline input), push/pull buttons
  - **Inline diff**: Click a changed file to open a diff view in the editor panel (Monaco supports diff editor)
- **Polling + event-driven refresh**:
  - Poll git status every 5s while project is active (cheap operation).
  - Also refresh on `file:changed` events (debounced) since file changes likely mean git status changed.
  - Refresh after any git action (stage, commit, push).
- **Diff viewer**: Monaco has a built-in diff editor (`MonacoDiffEditor`). When a changed file is clicked in Source Control, show old vs new content side-by-side or inline in the editor panel.
- **IPC channels**:
  - `git:status` — returns branch, staged, unstaged, untracked for a project path
  - `git:diff` — returns diff for a specific file
  - `git:stage` — stage file(s)
  - `git:unstage` — unstage file(s)
  - `git:commit` — commit with message
  - `git:push` / `git:pull` — sync with remote
  - `git:log` — recent commit history (optional, for a log view later)

### Files to Touch
- `electron/gitManager.ts` — new module wrapping `simple-git` or raw git commands
- `electron/main.ts` — register `git:*` IPC handlers
- `electron/preload.ts` — expose `git.*` API to renderer
- `src/types/index.ts` — GitStatus, GitFileChange types
- `src/stores/projectStore.ts` (or new `src/stores/gitStore.ts`) — git state per project
- `src/components/sidebar/` — tab bar for Files/Source Control, new SourceControlPanel
- `src/components/sidebar/SourceControlPanel.tsx` — staged/unstaged/untracked lists, commit input
- `src/components/sidebar/GitFileItem.tsx` — individual changed file row with status badge + stage/unstage
- `src/components/editor/EditorPanel.tsx` — support diff mode via Monaco diff editor

---

## 10. Editor LSP Integration
**Priority**: Low
**Status**: Not started

### Goal
Add Language Server Protocol support to the Monaco editor for richer IntelliSense, diagnostics, and go-to-definition beyond what Monaco provides built-in.

### Current State
- Monaco (`@monaco-editor/react ^4.7.0`, `monaco-editor ^0.55.1`) has built-in TypeScript/JavaScript IntelliSense via web workers — no LSP needed for TS/JS.
- Built-in support also covers HTML, CSS, JSON.
- No LSP packages installed. No language server infrastructure.

### Approach
- **Skip TS/JS/HTML/CSS/JSON** — Monaco's built-in support is sufficient. Focus LSP on languages without built-in IntelliSense (Python, Rust, Go, etc.).
- **Architecture**: Follows the same pattern as `ptyManager.ts` — main process spawns language server processes via `child_process.spawn`, communicates via stdio. Bridge to renderer via Electron IPC.
- **Key packages**: `monaco-languageclient` (v10+), `vscode-languageserver-protocol`, `vscode-ws-jsonrpc`. Requires `monaco-vscode-api` as peer dependency.
- **Language server manager**: New `electron/lspManager.ts` — spawns/manages language server processes per language per project. Similar lifecycle to PTY manager (create, track, destroy).
- **Incremental rollout**:
  1. Start with Python (`pylsp`) as proof-of-concept — easiest to integrate
  2. Add Rust (`rust-analyzer`) and Go (`gopls`)
  3. Each language server is a separate binary that must be installed on the user's system (or bundled)
- **Complexity**: Moderate. Version compatibility between `monaco-editor`, `monaco-languageclient`, and `monaco-vscode-api` is the main risk. Language server binaries need to be discovered or configured (add per-language path settings).
- **Prerequisite**: Editor tabs (#9) should land first — LSP features like go-to-definition need multi-file navigation.

### IPC Channels
- `lsp:start` — launch language server for a language + project
- `lsp:stop` — shut down language server
- `lsp:message` — bidirectional LSP JSON-RPC messages between renderer and main

### Files to Touch
- `electron/lspManager.ts` — new module for language server lifecycle
- `electron/main.ts` — register `lsp:*` IPC handlers
- `electron/preload.ts` — expose LSP message bridge
- `src/components/editor/EditorPanel.tsx` — integrate `monaco-languageclient`, connect to IPC bridge
- `src/stores/settingsStore.ts` — language server paths config
- `src/components/settings/SettingsModal.tsx` — LSP configuration UI
- `package.json` — add `monaco-languageclient`, `monaco-vscode-api`, `vscode-languageserver-protocol`
