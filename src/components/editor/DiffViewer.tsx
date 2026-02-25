import { useEffect, useState, useCallback } from 'react'
import { DiffEditor, useMonaco } from '@monaco-editor/react'
import { useSettingsStore } from '../../stores/settingsStore'
import { themes, getMonacoThemeData } from '../../themes'
import { getLang } from '../../utils/lang'

interface DiffViewerProps {
  filePath: string
  staged: boolean
  projectRoot: string
  onClose: () => void
}

export function DiffViewer({ filePath, staged, projectRoot, onClose }: DiffViewerProps) {
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [loading, setLoading] = useState(true)
  const [sideBySide, setSideBySide] = useState(true)
  const themeName = useSettingsStore((s) => s.settings.theme)
  const monacoTheme = (themes[themeName] ?? themes.obsidian).monacoTheme
  const monaco = useMonaco()

  // Register the custom Monaco theme
  useEffect(() => {
    if (!monaco) return
    const themeDef = themes[themeName] ?? themes.obsidian
    monaco.editor.defineTheme(themeDef.monacoTheme, getMonacoThemeData(themeDef))
    monaco.editor.setTheme(themeDef.monacoTheme)
  }, [monaco, themeName])

  const language = getLang(filePath)
  const fileName = filePath.split('/').pop() ?? filePath

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const fetchDiff = async () => {
      let orig = ''
      let mod = ''

      try {
        // Original: HEAD version
        orig = await window.electronAPI.git.showFile(projectRoot, 'HEAD', filePath)
      } catch {
        // New file — no HEAD version
        orig = ''
      }

      try {
        if (staged) {
          // Staged: modified = index version (`:0:path`)
          mod = await window.electronAPI.git.showFile(projectRoot, ':0', filePath)
        } else {
          // Unstaged: modified = working tree (read from disk)
          mod = await window.electronAPI.file.readFile(filePath)
        }
      } catch {
        // Deleted file
        mod = ''
      }

      if (!cancelled) {
        setOriginal(orig)
        setModified(mod)
        setLoading(false)
      }
    }

    fetchDiff()
    return () => { cancelled = true }
  }, [filePath, staged, projectRoot])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] text-zinc-200 truncate">{fileName}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            staged ? 'bg-green-900/40 text-green-400' : 'bg-amber-900/40 text-amber-400'
          }`}>
            {staged ? 'Staged' : 'Working Tree'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSideBySide(!sideBySide)}
            className="text-zinc-500 hover:text-zinc-300 text-[11px] px-1.5 py-0.5 rounded hover:bg-[var(--t-border)] transition-colors"
            title={sideBySide ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
          >
            {sideBySide ? 'Inline' : 'Side-by-side'}
          </button>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[var(--t-border)] transition-colors"
            title="Close diff (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-[13px]">Loading diff...</div>
        ) : (
          <DiffEditor
            height="100%"
            language={language}
            original={original}
            modified={modified}
            theme={monacoTheme}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 },
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              readOnly: true,
              renderSideBySide: sideBySide,
            }}
          />
        )}
      </div>
    </div>
  )
}
