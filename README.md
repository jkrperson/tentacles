<div align="center">

<img width="100%" alt="Tentacles" src="public/Screenshot.png" />

# Tentacles

### The IDE for Claude Code Agents

[![GitHub stars](https://img.shields.io/github/stars/jkrperson/tentacles?style=flat&logo=github)](https://github.com/jkrperson/tentacles/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/jkrperson/tentacles?style=flat&logo=github)](https://github.com/jkrperson/tentacles/releases)
[![License](https://img.shields.io/github/license/jkrperson/tentacles?style=flat)](LICENSE.md)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/8SFrcfhc)

<br />

[**Download**](#installation) &bull; [Changelog](https://github.com/jkrperson/tentacles/releases) &bull; [Discord](https://discord.gg/8SFrcfhc) &bull; [Issues](https://github.com/jkrperson/tentacles/issues)

</div>

## Why Tentacles?

Tentacles is a desktop IDE purpose-built for orchestrating multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents across your projects. Manage sessions, browse files, edit code, and track changes — all in one window.

- **Run many agents at once** without context switching between terminals
- **Isolate work in git worktrees** so agents don't step on each other
- **See what every agent is doing** in real time — reading, editing, thinking, or waiting
- **Resume any session** with full conversation history intact

## Features

| Feature | Description |
|:--------|:------------|
| **Parallel Agents** | Spawn as many Claude Code agents as you need, each in its own terminal |
| **Git Worktrees** | One-click isolated worktree per agent — each gets its own branch |
| **Real-time Status** | See exactly what each agent is doing: reading files, running commands, editing, thinking |
| **Session Resume** | Resume any past session with full conversation history |
| **File Explorer** | Browse project files with real-time updates and git status indicators |
| **Code Editor** | Tabbed Monaco editor with syntax highlighting |
| **Shell Terminals** | Open regular shell terminals alongside your agents |
| **Desktop Notifications** | Get notified when an agent finishes or needs attention |
| **Themes** | Four built-in themes: Obsidian, Midnight, Ember, and Dawn |
| **Keyboard-driven** | `⌘T` new agent, `⌘1-9` switch agents, `⌘,` settings, and more |

## Installation

### macOS

| Chip | Download |
|:-----|:---------|
| Apple Silicon (M1/M2/M3/M4) | [Tentacles-Mac-arm64.dmg](https://github.com/jkrperson/tentacles/releases/latest/download/Tentacles-Mac-0.0.1-arm64.dmg) |
| Intel x64 | [Tentacles-Mac-x64.dmg](https://github.com/jkrperson/tentacles/releases/latest/download/Tentacles-Mac-0.0.1-x64.dmg) |

> **Important: macOS unsigned app workaround**
>
> Tentacles is not yet code-signed. macOS will block it on first launch. To fix this:
>
> 1. Open the `.dmg` and drag Tentacles to `/Applications`
> 2. Run this command in Terminal to remove the quarantine flag:
>    ```bash
>    xattr -cr /Applications/Tentacles.app
>    ```
> 3. Open Tentacles normally from your Applications folder
>
> Alternatively, you can right-click the app and choose "Open" on first launch, then click "Open" in the dialog.

### Windows

| Type | Download |
|:-----|:---------|
| Installer | [Tentacles-Windows-Setup.exe](https://github.com/jkrperson/tentacles/releases/latest/download/Tentacles-Windows-0.0.1-Setup.exe) |

### Linux

| Type | Download |
|:-----|:---------|
| AppImage | [Tentacles-Linux.AppImage](https://github.com/jkrperson/tentacles/releases/latest/download/Tentacles-Linux-0.0.1.AppImage) |

### Build from Source

<details>
<summary>Click to expand build instructions</summary>

**1. Clone the repository**

```bash
git clone https://github.com/jkrperson/tentacles.git
cd tentacles
```

**2. Install dependencies and run**

```bash
bun install
bun run dev
```

**3. Build the desktop app**

```bash
bun run build
```

Produces packaged binaries in `release/`.

</details>

## Requirements

| Requirement | Details |
|:------------|:--------|
| **OS** | macOS, Windows, Linux |
| **Runtime** | [Bun](https://bun.sh/) v1.0+ (build from source only) |
| **Claude Code** | [CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated |
| **Git** | 2.20+ (for worktree features) |
| **Node.js** | 18+ (build from source only) |

## Usage

1. **Add a project** — Click "Add Project" in the sidebar and select a folder.
2. **Start an agent** — Click "+" (or `⌘T`) to spawn a Claude agent.
3. **Use worktrees** — Click the dropdown next to "+" to create an agent in an isolated git worktree with its own branch.
4. **Browse files** — The file tree shows real-time updates as agents make changes. Git status colors highlight modified files.
5. **Manage sessions** — Completed agents move to "Recent" where you can resume or delete them.

## Tech Stack

<p>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-%23007ACC.svg?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white" alt="TailwindCSS" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://trpc.io/"><img src="https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white" alt="tRPC" /></a>
  <a href="https://microsoft.github.io/monaco-editor/"><img src="https://img.shields.io/badge/Monaco-68217A?logo=visual-studio-code&logoColor=white" alt="Monaco" /></a>
  <a href="https://xtermjs.org/"><img src="https://img.shields.io/badge/xterm.js-000000?logo=windows-terminal&logoColor=white" alt="xterm.js" /></a>
  <a href="https://zustand.docs.pmnd.rs/"><img src="https://img.shields.io/badge/Zustand-443E38?logo=react&logoColor=white" alt="Zustand" /></a>
</p>

## Contributing

Contributions are welcome! If you have a suggestion:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

You can also [open issues](https://github.com/jkrperson/tentacles/issues) for bugs or feature requests.

## Community

- **[Discord](https://discord.gg/8SFrcfhc)** — Chat with the team and community
- **[GitHub Issues](https://github.com/jkrperson/tentacles/issues)** — Report bugs and request features

## License

Distributed under the Elastic License 2.0 (ELv2). See [LICENSE.md](LICENSE.md) for more information.
