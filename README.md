# Tentacles

An IDE for orchestrating multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents across your projects — manage sessions, browse files, edit code, and track changes, all in one window.

<!-- TODO: Add demo GIF/video here -->

## Features

- **Multiple agents at once** — Spawn as many Claude agents as you need, each running in its own terminal. See all their output side-by-side.
- **Project organization** — Group agents by project. Switch between projects and each one keeps its own agents, file tree, and editor tabs.
- **Git worktrees** — Spin up an agent in an isolated git worktree with one click. Each agent gets its own branch so they don't step on each other.
- **Real-time status** — See exactly what each agent is doing: reading files, running commands, editing code, thinking, or waiting for input.
- **Session resume** — Closed an agent by accident? Resume any past session with full conversation history intact.
- **Built-in file explorer** — Browse your project files with real-time updates as agents make changes. Git status indicators show what's modified.
- **Code editor** — Open and edit files in a tabbed Monaco editor with syntax highlighting.
- **Shell terminals** — Open regular shell terminals alongside your agents for manual commands.
- **Desktop notifications** — Get notified when an agent finishes or needs your attention.
- **Themes** — Four built-in themes: Obsidian, Midnight, Ember, and Dawn.
- **Keyboard-driven** — `Cmd+T` new agent, `Cmd+1-9` switch agents, `Cmd+,` settings, and more.

## Install

### Prerequisites

- [Bun](https://bun.sh)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Git (for worktree features)
- Node.js 18+ (for native module compilation)

### Setup

```sh
git clone https://github.com/jkrperson/tentacles.git
cd tentacles
bun install
bun run dev
```

### Build

```sh
bun run build
```

Produces packaged binaries in `release/` for macOS, Windows, and Linux.

## Usage

1. **Add a project** — Click "Add Project" in the left sidebar and select a folder.
2. **Start an agent** — Click the "+" button (or `Cmd+T`) to spawn a Claude agent in that project.
3. **Use worktrees** — Click the dropdown arrow next to "+" to create an agent in a new git worktree. It gets its own branch automatically.
4. **Browse files** — The right panel shows your file tree. Click a file to open it in the editor. Changed files are highlighted with git status colors.
5. **Manage sessions** — Completed agents move to "Recent" where you can resume or delete them.

## Tech Stack

- Electron + React + TypeScript
- Tailwind CSS v4
- xterm.js + node-pty (terminals)
- Monaco (editor)
- Zustand (state management)
- chokidar (file watching)

## Roadmap

These features are planned but not yet implemented:

- [ ] **Distributable release** — Pre-built downloadable binaries for macOS, Windows, and Linux so you don't need to build from source
- [ ] **Git operations** — Stage, unstage, commit, push, and pull directly from the Source Control tab
- [ ] **Git diff viewer** — Side-by-side and inline diff comparison for changed files using Monaco's diff editor
- [ ] **More themes & keybinding customization** — Custom color schemes, user-defined keyboard shortcuts, and importable theme files
- [ ] **Full-featured editor** — Editor tabs with preview mode, multi-cursor editing, search & replace, and LSP integration for autocomplete, go-to-definition, and diagnostics across languages (Python, Rust, Go, and more)
- [ ] **Session persistence** — Restore open agents and project state across app restarts
- [ ] **Agent output logging** — Export or save agent conversation history

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[Apache 2.0](LICENSE)
