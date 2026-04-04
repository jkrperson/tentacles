// ── Sub-interfaces ──────────────────────────────────────────────────────

export interface ThemeUI {
  background: string
  surface: string
  elevated: string
  hover: string
  active: string

  border: string
  borderInput: string
  borderInputHover: string

  foreground: string
  secondary: string
  muted: string
  faint: string

  scrollbar: string
  scrollbarHover: string
  scrollbarXterm: string

  accent: string
  accentHover: string
}

export interface ThemeTerminal {
  background?: string   // defaults to ui.background
  foreground?: string   // defaults to ui.foreground
  cursor?: string       // defaults to ui.accent
  selection?: string    // defaults to ui.accent + alpha
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface ThemeGit {
  modified?: string     // defaults to terminal.yellow
  added?: string        // defaults to terminal.green
  untracked?: string    // defaults to terminal.green
  deleted?: string      // defaults to terminal.red
  conflicting?: string  // defaults to terminal.brightRed
  renamed?: string      // defaults to terminal.cyan
  ignored?: string      // defaults to ui.faint
}

export interface ThemeStatus {
  running?: string      // defaults to terminal.blue
  needsInput?: string   // defaults to terminal.yellow
  completed?: string    // defaults to terminal.green
  errored?: string      // defaults to terminal.red
  idle?: string         // defaults to ui.faint
}

// ── Root theme type ─────────────────────────────────────────────────────

export interface ThemeDefinition {
  appearance: 'dark' | 'light'
  ui: ThemeUI
  terminal: ThemeTerminal
  git?: ThemeGit
  status?: ThemeStatus
  monacoTheme: string
  zincOverrides?: Record<string, string>
}

// ── Built-in themes ─────────────────────────────────────────────────────

export const themes: Record<string, ThemeDefinition> = {
  obsidian: {
    appearance: 'dark',
    ui: {
      background: '#19191d',
      surface: '#1e1e22',
      elevated: '#232328',
      hover: '#2a2a30',
      active: '#262630',
      border: '#2e2e35',
      borderInput: '#3a3a42',
      borderInputHover: '#4a4a52',
      foreground: '#e4e4e7',
      secondary: '#a1a1aa',
      muted: '#71717a',
      faint: '#52525b',
      scrollbar: '#2e2e35',
      scrollbarHover: '#3a3a42',
      scrollbarXterm: '#333338',
      accent: '#7c3aed',
      accentHover: '#8b5cf6',
    },
    terminal: {
      black: '#19191d',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e4e4e7',
      brightBlack: '#52525b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#fafafa',
    },
    monacoTheme: 'tentacles-obsidian',
  },

  midnight: {
    appearance: 'dark',
    ui: {
      background: '#161923',
      surface: '#1a1d28',
      elevated: '#1f2230',
      hover: '#262a38',
      active: '#222636',
      border: '#2a2e3e',
      borderInput: '#343a4c',
      borderInputHover: '#444b60',
      foreground: '#dfe3ec',
      secondary: '#8b92a8',
      muted: '#5c6380',
      faint: '#3f455c',
      scrollbar: '#2a2e3e',
      scrollbarHover: '#343a4c',
      scrollbarXterm: '#2e3348',
      accent: '#3b82f6',
      accentHover: '#60a5fa',
    },
    terminal: {
      black: '#161923',
      red: '#f87171',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#a78bfa',
      cyan: '#22d3ee',
      white: '#dfe3ec',
      brightBlack: '#4b5068',
      brightRed: '#fca5a5',
      brightGreen: '#6ee7b7',
      brightYellow: '#fde68a',
      brightBlue: '#93bbfd',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#f1f5f9',
    },
    monacoTheme: 'tentacles-midnight',
  },

  ember: {
    appearance: 'dark',
    ui: {
      background: '#1c1815',
      surface: '#211d1a',
      elevated: '#272220',
      hover: '#302a27',
      active: '#2c2724',
      border: '#362f2b',
      borderInput: '#423a35',
      borderInputHover: '#524842',
      foreground: '#e8e0da',
      secondary: '#a8998e',
      muted: '#786a5e',
      faint: '#584c42',
      scrollbar: '#362f2b',
      scrollbarHover: '#423a35',
      scrollbarXterm: '#3c3530',
      accent: '#d97706',
      accentHover: '#f59e0b',
    },
    terminal: {
      black: '#1c1815',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#c084fc',
      cyan: '#06b6d4',
      white: '#e8e0da',
      brightBlack: '#5c5048',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#d8b4fe',
      brightCyan: '#22d3ee',
      brightWhite: '#faf5f0',
    },
    monacoTheme: 'tentacles-ember',
  },

  monokai: {
    appearance: 'dark',
    ui: {
      background: '#272822',
      surface: '#2d2e27',
      elevated: '#33342d',
      hover: '#3e3f38',
      active: '#383930',
      border: '#3e3f38',
      borderInput: '#4a4b44',
      borderInputHover: '#5a5b54',
      foreground: '#f8f8f2',
      secondary: '#a6a68a',
      muted: '#75715e',
      faint: '#5a5950',
      scrollbar: '#3e3f38',
      scrollbarHover: '#4a4b44',
      scrollbarXterm: '#44453e',
      accent: '#a6e22e',
      accentHover: '#b6f23e',
    },
    terminal: {
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#e6db74',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#e6db74',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
    monacoTheme: 'tentacles-monokai',
  },

  dawn: {
    appearance: 'light',
    ui: {
      background: '#faf8f5',
      surface: '#f2efe9',
      elevated: '#ffffff',
      hover: '#e8e4dd',
      active: '#ebe7e1',
      border: '#d6d0c7',
      borderInput: '#c4bbae',
      borderInputHover: '#a89e90',
      foreground: '#1c1917',
      secondary: '#57534e',
      muted: '#78716c',
      faint: '#a8a29e',
      scrollbar: '#d6d0c7',
      scrollbarHover: '#c4bbae',
      scrollbarXterm: '#cec7bc',
      accent: '#7c3aed',
      accentHover: '#6d28d9',
    },
    terminal: {
      black: '#1c1917',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0891b2',
      white: '#faf8f5',
      brightBlack: '#78716c',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#8b5cf6',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff',
    },
    monacoTheme: 'tentacles-dawn',
    zincOverrides: {
      '50': '#1c1917',
      '100': '#292524',
      '200': '#44403c',
      '300': '#57534e',
      '400': '#78716c',
      '500': '#a8a29e',
      '600': '#a8a29e',
      '700': '#d6d3d1',
      '800': '#e7e5e4',
      '900': '#f5f5f4',
      '950': '#fafaf9',
    },
  },
}

export const builtinThemeKeys = Object.keys(themes) as string[]

// ── Resolved colors (with defaults) ────────────────────────────────────

/** Resolve terminal colors, filling in defaults from ui */
export function resolveTerminal(theme: ThemeDefinition) {
  const t = theme.terminal
  return {
    background: t.background ?? theme.ui.background,
    foreground: t.foreground ?? theme.ui.foreground,
    cursor: t.cursor ?? theme.ui.accent,
    selection: t.selection ?? (theme.ui.accent + '33'),
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  }
}

/** Resolve git colors, falling back to terminal palette */
export function resolveGit(theme: ThemeDefinition) {
  const g = theme.git
  const t = theme.terminal
  return {
    modified: g?.modified ?? t.yellow,
    added: g?.added ?? t.green,
    untracked: g?.untracked ?? t.green,
    deleted: g?.deleted ?? t.red,
    conflicting: g?.conflicting ?? t.brightRed,
    renamed: g?.renamed ?? t.cyan,
    ignored: g?.ignored ?? theme.ui.faint,
  }
}

/** Resolve status colors, falling back to terminal palette */
export function resolveStatus(theme: ThemeDefinition) {
  const s = theme.status
  const t = theme.terminal
  return {
    running: s?.running ?? t.blue,
    needsInput: s?.needsInput ?? t.yellow,
    completed: s?.completed ?? t.green,
    errored: s?.errored ?? t.red,
    idle: s?.idle ?? theme.ui.faint,
  }
}

// ── Custom theme merging ────────────────────────────────────────────────

export interface CustomThemeFile {
  name: string
  appearance?: 'dark' | 'light'
  author?: string
  base: string
  ui?: Partial<ThemeUI>
  terminal?: Partial<ThemeTerminal>
  git?: Partial<ThemeGit>
  status?: Partial<ThemeStatus>
  zincOverrides?: Record<string, string>
}

export function mergeCustomTheme(base: ThemeDefinition, custom: CustomThemeFile, key: string): ThemeDefinition {
  return {
    appearance: custom.appearance ?? base.appearance,
    ui: { ...base.ui, ...custom.ui },
    terminal: { ...base.terminal, ...custom.terminal },
    git: { ...base.git, ...custom.git },
    status: { ...base.status, ...custom.status },
    monacoTheme: `tentacles-custom-${key}`,
    zincOverrides: custom.zincOverrides ?? base.zincOverrides,
  }
}

// ── CSS variable application ────────────────────────────────────────────

export function applyThemeToDOM(theme: ThemeDefinition) {
  const root = document.documentElement
  const ui = theme.ui
  const git = resolveGit(theme)
  const status = resolveStatus(theme)

  // UI variables
  root.style.setProperty('--t-bg-base', ui.background)
  root.style.setProperty('--t-bg-surface', ui.surface)
  root.style.setProperty('--t-bg-elevated', ui.elevated)
  root.style.setProperty('--t-bg-hover', ui.hover)
  root.style.setProperty('--t-bg-active', ui.active)
  root.style.setProperty('--t-border', ui.border)
  root.style.setProperty('--t-border-input', ui.borderInput)
  root.style.setProperty('--t-border-input-hover', ui.borderInputHover)
  root.style.setProperty('--t-text-primary', ui.foreground)
  root.style.setProperty('--t-text-secondary', ui.secondary)
  root.style.setProperty('--t-text-muted', ui.muted)
  root.style.setProperty('--t-text-faint', ui.faint)
  root.style.setProperty('--t-scrollbar', ui.scrollbar)
  root.style.setProperty('--t-scrollbar-hover', ui.scrollbarHover)
  root.style.setProperty('--t-scrollbar-xterm', ui.scrollbarXterm)
  root.style.setProperty('--t-accent', ui.accent)
  root.style.setProperty('--t-accent-hover', ui.accentHover)

  // Derived
  root.style.setProperty('--t-bg-base-50', ui.background + '80')

  // Git variables
  root.style.setProperty('--t-git-modified', git.modified)
  root.style.setProperty('--t-git-added', git.added)
  root.style.setProperty('--t-git-untracked', git.untracked)
  root.style.setProperty('--t-git-deleted', git.deleted)
  root.style.setProperty('--t-git-conflicting', git.conflicting)
  root.style.setProperty('--t-git-renamed', git.renamed)
  root.style.setProperty('--t-git-ignored', git.ignored)

  // Status variables
  root.style.setProperty('--t-status-running', status.running)
  root.style.setProperty('--t-status-needs-input', status.needsInput)
  root.style.setProperty('--t-status-completed', status.completed)
  root.style.setProperty('--t-status-errored', status.errored)
  root.style.setProperty('--t-status-idle', status.idle)

  // Mirror bg color to localStorage for flash prevention
  try { localStorage.setItem('tentacles-theme-bg', ui.background) } catch { /* ignore */ }

  root.setAttribute('data-theme', theme.appearance === 'light' ? 'dawn' : 'dark')

  // Override Tailwind zinc scale for light theme
  if (theme.zincOverrides) {
    for (const [shade, value] of Object.entries(theme.zincOverrides)) {
      root.style.setProperty(`--color-zinc-${shade}`, value)
    }
  } else {
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
    for (const shade of shades) {
      root.style.removeProperty(`--color-zinc-${shade}`)
    }
  }
}

// ── Monaco theme generation ─────────────────────────────────────────────

export function getMonacoThemeData(theme: ThemeDefinition): {
  base: 'vs' | 'vs-dark'
  inherit: boolean
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
  colors: Record<string, string>
} {
  const ui = theme.ui
  const isDark = theme.appearance === 'dark'
  const selectionBg = ui.accent + '33'
  const inactiveSelectionBg = ui.accent + '1a'
  const highlightBg = ui.accent + '15'

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': ui.background,
      'editor.foreground': ui.foreground,
      'editor.lineHighlightBackground': ui.hover,
      'editor.selectionBackground': selectionBg,
      'editor.inactiveSelectionBackground': inactiveSelectionBg,
      'editor.selectionHighlightBackground': highlightBg,
      'editor.wordHighlightBackground': highlightBg,
      'editor.wordHighlightStrongBackground': highlightBg,
      'editor.findMatchBackground': ui.accent + '40',
      'editor.findMatchHighlightBackground': ui.accent + '22',
      'editorCursor.foreground': ui.accent,
      'editorLineNumber.foreground': ui.faint,
      'editorLineNumber.activeForeground': ui.secondary,
      'editorGutter.background': ui.background,
      'editorIndentGuide.background': ui.border,
      'editorIndentGuide.activeBackground': ui.borderInput,
      'editorWidget.background': ui.elevated,
      'editorWidget.border': ui.border,
      'editorBracketMatch.background': ui.accent + '22',
      'editorBracketMatch.border': ui.accent + '55',
      'editorOverviewRuler.border': ui.border,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': ui.scrollbar + '80',
      'scrollbarSlider.hoverBackground': ui.scrollbarHover,
      'scrollbarSlider.activeBackground': ui.scrollbarHover,
      'list.hoverBackground': ui.hover,
      'list.activeSelectionBackground': ui.active,
      'list.activeSelectionForeground': ui.foreground,
      'list.inactiveSelectionBackground': ui.active,
      'list.focusBackground': ui.hover,
      'list.highlightForeground': ui.accent,
      'input.background': ui.surface,
      'input.border': ui.borderInput,
      'input.foreground': ui.foreground,
      'inputOption.activeBorder': ui.accent,
      'dropdown.background': ui.elevated,
      'dropdown.border': ui.border,
      'dropdown.foreground': ui.foreground,
      'peekViewEditor.background': ui.surface,
      'peekViewResult.background': ui.elevated,
      'peekViewTitle.background': ui.elevated,
      'peekViewEditor.matchHighlightBackground': ui.accent + '33',
      'diffEditor.insertedTextBackground': isDark ? '#22c55e18' : '#16a34a18',
      'diffEditor.removedTextBackground': isDark ? '#ef444418' : '#dc262618',
    },
  }
}

// ── Terminal theme ──────────────────────────────────────────────────────

export function getTerminalTheme(theme: ThemeDefinition) {
  return resolveTerminal(theme)
}
