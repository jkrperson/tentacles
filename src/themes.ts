export interface ThemeDefinition {
  // Surfaces
  bgBase: string
  bgSurface: string
  bgElevated: string
  bgHover: string
  bgActive: string

  // Borders
  border: string
  borderInput: string
  borderInputHover: string

  // Text
  textPrimary: string
  textSecondary: string
  textMuted: string
  textFaint: string

  // Scrollbar
  scrollbar: string
  scrollbarHover: string
  scrollbarXterm: string

  // Accent
  accent: string
  accentHover: string

  // Terminal ANSI
  termBg: string
  termFg: string
  termCursor: string
  termSelection: string
  termBlack: string
  termRed: string
  termGreen: string
  termYellow: string
  termBlue: string
  termMagenta: string
  termCyan: string
  termWhite: string
  termBrightBlack: string
  termBrightRed: string
  termBrightGreen: string
  termBrightYellow: string
  termBrightBlue: string
  termBrightMagenta: string
  termBrightCyan: string
  termBrightWhite: string

  // Monaco
  monacoTheme: string

  // Dawn-only: inverted zinc scale for Tailwind overrides
  zincOverrides?: Record<string, string>
}

export const themes: Record<string, ThemeDefinition> = {
  obsidian: {
    bgBase: '#0e0e10',
    bgSurface: '#111113',
    bgElevated: '#141416',
    bgHover: '#1a1a1e',
    bgActive: '#18181c',

    border: '#1e1e22',
    borderInput: '#2a2a2e',
    borderInputHover: '#3a3a3e',

    textPrimary: '#e4e4e7',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    textFaint: '#52525b',

    scrollbar: '#1e1e22',
    scrollbarHover: '#2a2a2e',
    scrollbarXterm: '#27272a',

    accent: '#7c3aed',
    accentHover: '#8b5cf6',

    termBg: '#0e0e10',
    termFg: '#e4e4e7',
    termCursor: '#a78bfa',
    termSelection: '#6d28d933',
    termBlack: '#09090b',
    termRed: '#ef4444',
    termGreen: '#22c55e',
    termYellow: '#eab308',
    termBlue: '#3b82f6',
    termMagenta: '#a855f7',
    termCyan: '#06b6d4',
    termWhite: '#e4e4e7',
    termBrightBlack: '#52525b',
    termBrightRed: '#f87171',
    termBrightGreen: '#4ade80',
    termBrightYellow: '#facc15',
    termBrightBlue: '#60a5fa',
    termBrightMagenta: '#c084fc',
    termBrightCyan: '#22d3ee',
    termBrightWhite: '#fafafa',

    monacoTheme: 'tentacles-obsidian',
  },

  midnight: {
    bgBase: '#0b0d14',
    bgSurface: '#0e1018',
    bgElevated: '#12141c',
    bgHover: '#181b25',
    bgActive: '#151820',

    border: '#1c1f2b',
    borderInput: '#262a38',
    borderInputHover: '#363b4e',

    textPrimary: '#dfe3ec',
    textSecondary: '#8b92a8',
    textMuted: '#5c6380',
    textFaint: '#3f455c',

    scrollbar: '#1c1f2b',
    scrollbarHover: '#262a38',
    scrollbarXterm: '#22263a',

    accent: '#3b82f6',
    accentHover: '#60a5fa',

    termBg: '#0b0d14',
    termFg: '#dfe3ec',
    termCursor: '#60a5fa',
    termSelection: '#3b82f633',
    termBlack: '#080a10',
    termRed: '#f87171',
    termGreen: '#34d399',
    termYellow: '#fbbf24',
    termBlue: '#60a5fa',
    termMagenta: '#a78bfa',
    termCyan: '#22d3ee',
    termWhite: '#dfe3ec',
    termBrightBlack: '#4b5068',
    termBrightRed: '#fca5a5',
    termBrightGreen: '#6ee7b7',
    termBrightYellow: '#fde68a',
    termBrightBlue: '#93bbfd',
    termBrightMagenta: '#c4b5fd',
    termBrightCyan: '#67e8f9',
    termBrightWhite: '#f1f5f9',

    monacoTheme: 'tentacles-midnight',
  },

  ember: {
    bgBase: '#110e0c',
    bgSurface: '#141110',
    bgElevated: '#181413',
    bgHover: '#1f1a18',
    bgActive: '#1c1816',

    border: '#241e1b',
    borderInput: '#302824',
    borderInputHover: '#403630',

    textPrimary: '#e8e0da',
    textSecondary: '#a8998e',
    textMuted: '#786a5e',
    textFaint: '#584c42',

    scrollbar: '#241e1b',
    scrollbarHover: '#302824',
    scrollbarXterm: '#2a2420',

    accent: '#d97706',
    accentHover: '#f59e0b',

    termBg: '#110e0c',
    termFg: '#e8e0da',
    termCursor: '#fbbf24',
    termSelection: '#d9770633',
    termBlack: '#0d0a08',
    termRed: '#ef4444',
    termGreen: '#22c55e',
    termYellow: '#f59e0b',
    termBlue: '#3b82f6',
    termMagenta: '#c084fc',
    termCyan: '#06b6d4',
    termWhite: '#e8e0da',
    termBrightBlack: '#5c5048',
    termBrightRed: '#f87171',
    termBrightGreen: '#4ade80',
    termBrightYellow: '#fbbf24',
    termBrightBlue: '#60a5fa',
    termBrightMagenta: '#d8b4fe',
    termBrightCyan: '#22d3ee',
    termBrightWhite: '#faf5f0',

    monacoTheme: 'tentacles-ember',
  },

  dawn: {
    bgBase: '#faf8f5',
    bgSurface: '#f2efe9',
    bgElevated: '#ffffff',
    bgHover: '#e8e4dd',
    bgActive: '#ebe7e1',

    border: '#d6d0c7',
    borderInput: '#c4bbae',
    borderInputHover: '#a89e90',

    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#78716c',
    textFaint: '#a8a29e',

    scrollbar: '#d6d0c7',
    scrollbarHover: '#c4bbae',
    scrollbarXterm: '#cec7bc',

    accent: '#7c3aed',
    accentHover: '#6d28d9',

    termBg: '#faf8f5',
    termFg: '#1c1917',
    termCursor: '#7c3aed',
    termSelection: '#7c3aed22',
    termBlack: '#1c1917',
    termRed: '#dc2626',
    termGreen: '#16a34a',
    termYellow: '#ca8a04',
    termBlue: '#2563eb',
    termMagenta: '#7c3aed',
    termCyan: '#0891b2',
    termWhite: '#faf8f5',
    termBrightBlack: '#78716c',
    termBrightRed: '#ef4444',
    termBrightGreen: '#22c55e',
    termBrightYellow: '#eab308',
    termBrightBlue: '#3b82f6',
    termBrightMagenta: '#8b5cf6',
    termBrightCyan: '#06b6d4',
    termBrightWhite: '#ffffff',

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

const cssVarMap: Array<[keyof ThemeDefinition, string]> = [
  ['bgBase', '--t-bg-base'],
  ['bgSurface', '--t-bg-surface'],
  ['bgElevated', '--t-bg-elevated'],
  ['bgHover', '--t-bg-hover'],
  ['bgActive', '--t-bg-active'],
  ['border', '--t-border'],
  ['borderInput', '--t-border-input'],
  ['borderInputHover', '--t-border-input-hover'],
  ['textPrimary', '--t-text-primary'],
  ['textSecondary', '--t-text-secondary'],
  ['textMuted', '--t-text-muted'],
  ['textFaint', '--t-text-faint'],
  ['scrollbar', '--t-scrollbar'],
  ['scrollbarHover', '--t-scrollbar-hover'],
  ['scrollbarXterm', '--t-scrollbar-xterm'],
  ['accent', '--t-accent'],
  ['accentHover', '--t-accent-hover'],
]

export function applyThemeToDOM(theme: ThemeDefinition) {
  const root = document.documentElement

  for (const [key, varName] of cssVarMap) {
    root.style.setProperty(varName, theme[key] as string)
  }

  // Derived variable: base bg with 50% alpha for opacity modifiers
  root.style.setProperty('--t-bg-base-50', theme.bgBase + '80')

  root.setAttribute('data-theme', theme.zincOverrides ? 'dawn' : 'dark')

  // Override Tailwind zinc scale for light theme
  if (theme.zincOverrides) {
    for (const [shade, value] of Object.entries(theme.zincOverrides)) {
      root.style.setProperty(`--color-zinc-${shade}`, value)
    }
  } else {
    // Reset zinc overrides when switching away from dawn
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
    for (const shade of shades) {
      root.style.removeProperty(`--color-zinc-${shade}`)
    }
  }
}

/**
 * Generates a Monaco editor theme definition that matches the app theme.
 * Uses `inherit: true` so syntax highlighting rules come from the base theme,
 * while editor chrome colors (background, gutters, selections, etc.) match the app.
 */
export function getMonacoThemeData(theme: ThemeDefinition): {
  base: 'vs' | 'vs-dark'
  inherit: boolean
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
  colors: Record<string, string>
} {
  const isDark = !theme.zincOverrides
  const selectionBg = theme.accent + '33' // ~20% alpha
  const inactiveSelectionBg = theme.accent + '1a' // ~10% alpha
  const highlightBg = theme.accent + '15'

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': theme.bgBase,
      'editor.foreground': theme.textPrimary,
      'editor.lineHighlightBackground': theme.bgHover,
      'editor.selectionBackground': selectionBg,
      'editor.inactiveSelectionBackground': inactiveSelectionBg,
      'editor.selectionHighlightBackground': highlightBg,
      'editor.wordHighlightBackground': highlightBg,
      'editor.wordHighlightStrongBackground': highlightBg,
      'editor.findMatchBackground': theme.accent + '40',
      'editor.findMatchHighlightBackground': theme.accent + '22',
      'editorCursor.foreground': theme.accent,
      'editorLineNumber.foreground': theme.textFaint,
      'editorLineNumber.activeForeground': theme.textSecondary,
      'editorGutter.background': theme.bgBase,
      'editorIndentGuide.background': theme.border,
      'editorIndentGuide.activeBackground': theme.borderInput,
      'editorWidget.background': theme.bgElevated,
      'editorWidget.border': theme.border,
      'editorBracketMatch.background': theme.accent + '22',
      'editorBracketMatch.border': theme.accent + '55',
      'editorOverviewRuler.border': theme.border,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': theme.scrollbar + '80',
      'scrollbarSlider.hoverBackground': theme.scrollbarHover,
      'scrollbarSlider.activeBackground': theme.scrollbarHover,
      'list.hoverBackground': theme.bgHover,
      'list.activeSelectionBackground': theme.bgActive,
      'list.activeSelectionForeground': theme.textPrimary,
      'list.inactiveSelectionBackground': theme.bgActive,
      'list.focusBackground': theme.bgHover,
      'list.highlightForeground': theme.accent,
      'input.background': theme.bgSurface,
      'input.border': theme.borderInput,
      'input.foreground': theme.textPrimary,
      'inputOption.activeBorder': theme.accent,
      'dropdown.background': theme.bgElevated,
      'dropdown.border': theme.border,
      'dropdown.foreground': theme.textPrimary,
      'peekViewEditor.background': theme.bgSurface,
      'peekViewResult.background': theme.bgElevated,
      'peekViewTitle.background': theme.bgElevated,
      'peekViewEditor.matchHighlightBackground': theme.accent + '33',
      'diffEditor.insertedTextBackground': isDark ? '#22c55e18' : '#16a34a18',
      'diffEditor.removedTextBackground': isDark ? '#ef444418' : '#dc262618',
    },
  }
}

export function getTerminalTheme(theme: ThemeDefinition) {
  return {
    background: theme.termBg,
    foreground: theme.termFg,
    cursor: theme.termCursor,
    selectionBackground: theme.termSelection,
    black: theme.termBlack,
    red: theme.termRed,
    green: theme.termGreen,
    yellow: theme.termYellow,
    blue: theme.termBlue,
    magenta: theme.termMagenta,
    cyan: theme.termCyan,
    white: theme.termWhite,
    brightBlack: theme.termBrightBlack,
    brightRed: theme.termBrightRed,
    brightGreen: theme.termBrightGreen,
    brightYellow: theme.termBrightYellow,
    brightBlue: theme.termBrightBlue,
    brightMagenta: theme.termBrightMagenta,
    brightCyan: theme.termBrightCyan,
    brightWhite: theme.termBrightWhite,
  }
}
