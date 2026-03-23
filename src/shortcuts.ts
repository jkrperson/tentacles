/**
 * Centralised shortcut registry.
 *
 * Every bindable action lives here. The runtime reads the user's
 * `customKeybindings` from settings and falls back to `defaultKeys`.
 *
 * Key format: modifier tokens joined by `+`, followed by the key name.
 *   modifiers: meta, ctrl, shift, alt
 *   key names: lowercase letter, digit, or special name (tab, backspace, delete, escape, f2, `, [, ], etc.)
 *   Examples: "meta+shift+n", "ctrl+tab", "f2", "meta+alt+]"
 */

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const isMacOS = () => navigator.platform.includes('Mac')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShortcutDef {
  id: string
  label: string
  category: string
  defaultKeys: string
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SHORTCUT_DEFS: ShortcutDef[] = [
  // Sessions
  { id: 'session.create',        label: 'New agent session',          category: 'Sessions', defaultKeys: 'meta+t' },
  { id: 'tab.close',             label: 'Close active tab',           category: 'Sessions', defaultKeys: 'meta+w' },
  { id: 'session.close',         label: 'Close active session',      category: 'Sessions', defaultKeys: 'meta+shift+w' },
  { id: 'session.switch1-9',     label: 'Switch to session 1-9',     category: 'Sessions', defaultKeys: 'meta+1-9' },
  { id: 'tab.next',              label: 'Next tab',                  category: 'Sessions', defaultKeys: 'ctrl+tab' },
  { id: 'tab.prev',              label: 'Previous tab',              category: 'Sessions', defaultKeys: 'ctrl+shift+tab' },
  { id: 'session.spawnDialog',   label: 'Open agent spawn dialog',   category: 'Sessions', defaultKeys: 'meta+shift+n' },
  { id: 'session.rename',        label: 'Rename active session',     category: 'Sessions', defaultKeys: 'f2' },

  // Projects
  { id: 'project.add',           label: 'Add project',               category: 'Projects', defaultKeys: 'meta+o' },
  { id: 'project.remove',        label: 'Remove current project',    category: 'Projects', defaultKeys: 'meta+shift+backspace' },
  { id: 'project.next',          label: 'Next project',              category: 'Projects', defaultKeys: 'meta+shift+]' },
  { id: 'project.prev',          label: 'Previous project',          category: 'Projects', defaultKeys: 'meta+shift+[' },
  { id: 'project.newWorktree',   label: 'New worktree workspace',    category: 'Projects', defaultKeys: 'meta+shift+b' },

  // Terminal
  { id: 'terminal.create',       label: 'New terminal',              category: 'Terminal', defaultKeys: 'meta+`' },
  { id: 'terminal.toggle',       label: 'Toggle terminal panel',     category: 'Terminal', defaultKeys: 'meta+j' },
  { id: 'terminal.next',         label: 'Next terminal',             category: 'Terminal', defaultKeys: 'meta+alt+]' },
  { id: 'terminal.prev',         label: 'Previous terminal',         category: 'Terminal', defaultKeys: 'meta+alt+[' },
  { id: 'terminal.close',        label: 'Close active terminal',     category: 'Terminal', defaultKeys: 'ctrl+shift+w' },
  { id: 'terminal.focus',        label: 'Focus terminal panel',      category: 'Terminal', defaultKeys: 'ctrl+`' },

  // General
  { id: 'app.settings',          label: 'Open settings',             category: 'General', defaultKeys: 'meta+,' },
  { id: 'app.shortcuts',         label: 'Show keyboard shortcuts',   category: 'General', defaultKeys: 'meta+/' },
]

// Lookup by id
const defMap = new Map(SHORTCUT_DEFS.map((d) => [d.id, d]))
export function getShortcutDef(id: string): ShortcutDef | undefined {
  return defMap.get(id)
}

// ---------------------------------------------------------------------------
// Resolve effective keys (custom overrides → default)
// ---------------------------------------------------------------------------

export type CustomKeybindings = Record<string, string>

export function resolveKeys(id: string, custom: CustomKeybindings): string {
  if (custom[id]) return custom[id]
  return defMap.get(id)?.defaultKeys ?? ''
}

// ---------------------------------------------------------------------------
// Parse + match a key-string against a KeyboardEvent
// ---------------------------------------------------------------------------

interface ParsedShortcut {
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string // lowercase
}

export function parseKeys(keys: string): ParsedShortcut {
  const parts = keys.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  return {
    meta: parts.includes('meta'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key,
  }
}

export function matchesEvent(parsed: ParsedShortcut, e: KeyboardEvent): boolean {
  // "meta" maps to Cmd on macOS, Ctrl on other platforms.
  // "ctrl" always maps to the physical Ctrl key (for shortcuts like Ctrl+Tab).
  const isMac = isMacOS()
  const wantMeta = parsed.meta
  const wantCtrl = parsed.ctrl

  let metaOk: boolean
  let ctrlOk: boolean

  if (isMac) {
    metaOk = wantMeta === e.metaKey
    ctrlOk = wantCtrl === e.ctrlKey
  } else {
    // Non-mac: "meta" maps to Ctrl
    if (wantMeta && wantCtrl) {
      // Both — need Ctrl
      metaOk = true
      ctrlOk = e.ctrlKey
    } else if (wantMeta) {
      metaOk = true
      ctrlOk = e.ctrlKey // meta→ctrl on non-mac
    } else {
      metaOk = !e.metaKey
      ctrlOk = wantCtrl === e.ctrlKey
    }
  }

  if (!metaOk || !ctrlOk) return false
  if (parsed.shift !== e.shiftKey) return false
  if (parsed.alt !== e.altKey) return false

  // Key comparison
  const eventKey = e.key.toLowerCase()
  if (eventKey === parsed.key) return true
  // Handle special names
  if (parsed.key === 'backspace' && (eventKey === 'backspace' || eventKey === 'delete')) return true
  if (parsed.key === 'delete' && eventKey === 'delete') return true

  return false
}

// ---------------------------------------------------------------------------
// Check whether an event matches ANY registered shortcut (for xterm passthrough)
// ---------------------------------------------------------------------------

export function isAppShortcut(e: KeyboardEvent, custom: CustomKeybindings): boolean {
  for (const def of SHORTCUT_DEFS) {
    const keys = resolveKeys(def.id, custom)
    if (!keys) continue

    // Handle the special "meta+1-9" pattern
    if (keys.includes('1-9')) {
      const prefix = keys.replace('1-9', '')
      const wantMeta = prefix.includes('meta')
      const wantShift = prefix.includes('shift')
      const wantAlt = prefix.includes('alt')
      const wantCtrl = prefix.includes('ctrl')
      const isMac = isMacOS()
      const metaPressed = isMac ? e.metaKey : e.ctrlKey
      if (
        metaPressed === wantMeta &&
        e.shiftKey === wantShift &&
        e.altKey === wantAlt &&
        (isMac ? e.ctrlKey === wantCtrl : true) &&
        e.key >= '1' && e.key <= '9'
      ) {
        return true
      }
      continue
    }

    const parsed = parseKeys(keys)
    if (matchesEvent(parsed, e)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Display helpers — convert key string to nice symbols
// ---------------------------------------------------------------------------

const SYMBOL_MAP: Record<string, string> = {
  meta: '⌘',
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  backspace: '⌫',
  delete: '⌦',
  escape: 'Esc',
  tab: 'Tab',
  enter: '↩',
  '`': '`',
  '[': '[',
  ']': ']',
  ',': ',',
  '/': '/',
}

export function formatKeys(keys: string): string {
  if (!keys) return ''
  // Handle special "1-9" range notation
  if (keys.includes('1-9')) {
    const parts = keys.split('+')
    return parts.map((p) => p === '1-9' ? '1-9' : (SYMBOL_MAP[p] ?? p.toUpperCase())).join(' ')
  }
  const parts = keys.split('+')
  return parts
    .map((p) => SYMBOL_MAP[p] ?? p.toUpperCase())
    .join(' ')
}

// ---------------------------------------------------------------------------
// Encode a KeyboardEvent back into our key-string format (for recording)
// ---------------------------------------------------------------------------

const IGNORE_KEYS = new Set(['meta', 'control', 'shift', 'alt', 'capslock', 'os'])

export function encodeEvent(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase()
  if (IGNORE_KEYS.has(key)) return null // only modifiers pressed

  const parts: string[] = []
  const isMac = isMacOS()

  if (isMac ? e.metaKey : e.ctrlKey) parts.push('meta')
  if (e.ctrlKey && isMac) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')

  // Normalize key name
  let normalizedKey = key
  if (key === ' ') normalizedKey = 'space'
  if (key === 'backspace') normalizedKey = 'backspace'
  // F-keys come through as "f2", etc.

  parts.push(normalizedKey)
  return parts.join('+')
}
