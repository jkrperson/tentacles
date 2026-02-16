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
**Status**: Not started

### Goal
Add a Cursor/VS Code-style source control tab in the right sidebar. Users should see git status, staged/unstaged changes, diffs, and be able to perform basic git operations — all scoped to the active project.

### Current State
- No git integration exists anywhere in the codebase.
- The right sidebar currently only has the file tree tab.
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

## 7. New Agent in Git Worktree
**Priority**: High
**Status**: Not started

### Goal
Add a split-button dropdown on the "New Agent" button in `AgentSidebar.tsx`. The primary click stays the same (new agent in project cwd). The dropdown adds a "New Agent in Worktree" option that creates a git worktree, then spawns the Claude agent inside it.

### Current State
- "New Agent" button in `AgentSidebar.tsx` calls `onNewSession` → `App.tsx handleNewSession()` → IPC `session:create` → `ptyManager.create(name, cwd)`.
- No git integration or worktree awareness exists.
- Session type tracks `id, name, cwd, status, pid` — no worktree metadata.

### Approach
- **Split-button UI**: Turn the "New Agent" button into a split button — main area triggers normal new agent, a small chevron on the right opens a dropdown menu. No dropdown component exists yet, so build a minimal one (absolute-positioned div with click-outside-to-close).
- **Git repo detection**: Before showing the worktree option, check if the active project is a git repo (`fs.access(path.join(cwd, '.git'))`). Grey out / hide the option if not.
- **Worktree creation flow**:
  1. User clicks "New Agent in Worktree"
  2. App prompts for branch name (modal input, or auto-generate like `agent-<timestamp>`)
  3. Main process runs `git worktree add <path> -b <branch>` via `child_process.execFile` or `simple-git().raw()`
  4. Worktree path: `<project>/.worktrees/<branch>` or a temp directory
  5. Spawns agent PTY with `cwd` set to the new worktree path
- **Session metadata**: Extend `Session` type with optional worktree fields (`isWorktree`, `worktreePath`, `worktreeBranch`, `originalRepo`) so the UI can badge worktree sessions.
- **Cleanup**: On session kill/exit, prompt or auto-remove the worktree via `git worktree remove <path>`. Run `git worktree prune` as a safety net. Handle uncommitted changes gracefully (warn before force-removing).
- **Gotchas**: Same branch can't be checked out in multiple worktrees. Manually-deleted worktree dirs leave stale refs (need `prune`). Worktree creation requires a clean git state.

### IPC Channels
- `git:isRepo` — check if path is a git repository
- `git:worktree:create` — create worktree, return new path
- `git:worktree:remove` — clean up worktree on session end
- `git:worktree:list` — list existing worktrees for a repo

### Files to Touch
- `src/components/sessions/AgentSidebar.tsx` — split-button dropdown UI
- `src/types/index.ts` — extend `Session` with worktree fields
- `electron/gitManager.ts` — worktree commands (shares module with #6)
- `electron/main.ts` — register `git:worktree:*` IPC handlers
- `electron/preload.ts` — expose worktree API
- `src/App.tsx` — new `handleNewSessionInWorktree()` handler
- `src/stores/sessionStore.ts` — worktree session cleanup logic

---

## 8. UI/UX Improvements — Icons & Themes
**Priority**: Medium
**Status**: Not started

### Goal
Two improvements: (a) make dropdown/sidebar icons larger and more readable, (b) add a preset theme system with a settings toggle.

### Current State
- Icons are custom inline SVGs at 10–14px (`width="10"` to `width="14"`). No icon library.
- All colors are hardcoded hex values in Tailwind arbitrary syntax (`bg-[#0e0e10]`, `text-[#8c8c96]`).
- No theme system — single dark theme baked into `index.css` and component classes.
- Settings store (`settingsStore.ts`) has no appearance/theme field.

### Approach

#### a) Larger Icons
- Audit all inline SVGs in sidebar and dropdown areas (`AgentSidebar.tsx`, `ProjectGroup.tsx`, `SessionCard.tsx`, `FileTreeNode.tsx`). Bump `width`/`height` from 10–12 to 14–16 for action icons and 16–18 for navigation icons.
- Consider switching to an icon library like `lucide-react` (tree-shakeable, consistent sizing, designed for 24px grid that scales well to 16–18). This avoids maintaining dozens of inline SVGs.

#### b) Preset Themes
- **Theme definition**: Create a `src/themes/` directory with theme objects. Each theme defines a set of CSS custom properties (colors, borders, shadows). Start with 3–4 presets:
  - `midnight` (current dark — `#0e0e10` base)
  - `dark` (softer dark — `#1a1a2e` base)
  - `solarized-dark`
  - `light` (for the brave)
- **CSS custom properties**: Replace hardcoded hex values in `index.css` and components with `var(--bg-primary)`, `var(--text-primary)`, `var(--accent)`, etc. Tailwind v4 supports `@theme` directive for defining design tokens — use this.
- **Theme switching**: Add a `theme` field to `AppSettings` in `settingsStore.ts`. On change, swap the CSS custom properties on `:root`. Persist selection to `settings.json`.
- **Settings UI**: Add a theme picker in `SettingsModal.tsx` — row of color swatches or a dropdown showing theme names with preview.
- **Extensibility**: Structure themes as plain objects/JSON so custom themes can be added later (import from file, edit in settings).

### Files to Touch
- `src/index.css` — replace hex values with CSS custom properties, define `@theme`
- `src/themes/` — new directory with theme definitions (midnight.ts, dark.ts, etc.)
- `src/stores/settingsStore.ts` — add `theme` field
- `src/components/settings/SettingsModal.tsx` — theme picker UI
- `src/components/sessions/AgentSidebar.tsx` — larger icons
- `src/components/sessions/ProjectGroup.tsx` — larger icons
- `src/components/sessions/SessionCard.tsx` — larger icons
- `src/components/sidebar/FileTreeNode.tsx` — larger icons
- All components using hardcoded hex colors — migrate to CSS variables

---

## 9. Editor Tabs
**Priority**: High
**Status**: Not started

### Goal
Support multiple open files in the editor panel with a tab bar, like VS Code. Clicking a file in the tree opens it in a new tab (or focuses existing tab). Tabs can be closed individually.

### Current State
- `EditorPanel.tsx` shows a single file at a time. The open file is `selectedFilePath` from `projectStore.fileTreeCache`.
- No tab state, no file history, no multi-file support.
- Editor content (`content`, `savedContent`, `isDirty`) is local component state — lost on unmount.
- Layout conditionally renders `<EditorPanel />` only when a file is selected; otherwise it's unmounted entirely.

### Approach
- **Open files state**: Add an `openFiles` array to `projectStore` (per project). Each entry: `{ path, isDirty }`. Separate from `selectedFilePath` which becomes the "active tab".
- **Tab bar component**: New `EditorTabBar.tsx` above the Monaco editor. Horizontal scrollable tabs showing file name + close button. Active tab highlighted with violet underline (matching existing terminal tab style). Dirty indicator (dot) on unsaved files.
- **Tab behavior**:
  - Single-click file in tree → opens in "preview" mode (replaces preview tab, italic name). Double-click → pins as permanent tab (like VS Code).
  - Closing a tab activates the next one (or previous if last tab).
  - Middle-click to close.
  - Cmd+W closes active tab.
- **Editor state persistence**: Move file content out of local component state into the store (or a ref map) so switching tabs doesn't re-fetch. Keep a `Map<filePath, { content, savedContent }>` in memory.
- **Monaco model reuse**: Instead of remounting Monaco, switch the editor model (`editor.setModel()`). Create one `monaco.editor.createModel()` per open file. This preserves undo history and cursor position per tab.

### Files to Touch
- `src/stores/projectStore.ts` — `openFiles`, `activeFilePath` per project, actions for open/close/reorder
- `src/components/editor/EditorTabBar.tsx` — new tab bar component
- `src/components/editor/EditorPanel.tsx` — switch to model-based approach, integrate tab bar
- `src/components/sidebar/FileTreeNode.tsx` — single vs double click behavior
- `src/components/Layout.tsx` — keep editor mounted when tabs exist (even if no file actively selected)

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
