import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Editor, { useMonaco, type OnMount } from '@monaco-editor/react'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLspStore } from '../../stores/lspStore'
import { useLspClient } from '../../hooks/useLspClient'
import { themes } from '../../themes'
import { EditorTabBar } from './EditorTabBar'

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
  rs: 'rust', go: 'go', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', svg: 'xml', xml: 'xml',
}

/** Maps Monaco language IDs to LSP server language IDs */
const LSP_LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'typescript', // typescript-language-server handles JS too
  python: 'python',
  rust: 'rust',
  go: 'go',
}

function getLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

interface CacheEntry {
  content: string
  savedContent: string
}

export function EditorPanel() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const selectedFilePath = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.selectedFilePath ?? null : null
  })
  const openFiles = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.openFiles ?? [] : []
  })
  const closeFile = useProjectStore((s) => s.closeFile)
  const openFile = useProjectStore((s) => s.openFile)
  const themeName = useSettingsStore((s) => s.settings.theme)
  const enabledLspLanguages = useSettingsStore((s) => s.settings.enabledLspLanguages)
  const monacoTheme = (themes[themeName] ?? themes.obsidian).monacoTheme
  const monaco = useMonaco()

  const contentCache = useRef(new Map<string, CacheEntry>())
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())

  // --- LSP Integration ---
  const currentLang = selectedFilePath ? getLang(selectedFilePath) : 'plaintext'
  const lspLanguageId = LSP_LANGUAGE_MAP[currentLang] ?? null
  const lspEnabled = lspLanguageId !== null && enabledLspLanguages.includes(lspLanguageId)
  const startServer = useLspStore((s) => s.startServer)
  const getServerPort = useLspStore((s) => s.getServerPort)
  const [lspPort, setLspPort] = useState<number | null>(null)

  // Auto-start LSP server when a supported file is opened and LSP is enabled
  useEffect(() => {
    if (!lspEnabled || !lspLanguageId || !activeProjectId) {
      setLspPort(null)
      return
    }
    // Check if already running
    const existingPort = getServerPort(lspLanguageId, activeProjectId)
    if (existingPort) {
      setLspPort(existingPort)
      return
    }
    // Start the server
    let cancelled = false
    startServer(lspLanguageId, activeProjectId).then((port) => {
      if (!cancelled) setLspPort(port)
    })
    return () => { cancelled = true }
  }, [lspEnabled, lspLanguageId, activeProjectId, startServer, getServerPort])

  // Disable Monaco's built-in TS/JS diagnostics when LSP is active
  useEffect(() => {
    if (!monaco) return
    // Access typescript defaults via bracket notation — the types mark these as deprecated
    // but they still exist and are the only way to control built-in TS diagnostics
    const ts = monaco.languages.typescript as Record<string, unknown>
    const tsDefaults = ts.typescriptDefaults as { setDiagnosticsOptions: (opts: Record<string, boolean>) => void } | undefined
    const jsDefaults = ts.javascriptDefaults as { setDiagnosticsOptions: (opts: Record<string, boolean>) => void } | undefined
    if (!tsDefaults || !jsDefaults) return

    const suppress = lspEnabled && (currentLang === 'typescript' || currentLang === 'javascript')
    const opts = { noSemanticValidation: suppress, noSyntaxValidation: suppress }
    tsDefaults.setDiagnosticsOptions(opts)
    jsDefaults.setDiagnosticsOptions(opts)
  }, [monaco, lspEnabled, currentLang])

  // Callback for go-to-definition cross-file jumps
  const handleOpenFile = useCallback((path: string) => {
    if (activeProjectId) {
      openFile(activeProjectId, path)
    }
  }, [activeProjectId, openFile])

  // Wire up the LSP client hook
  useLspClient({
    port: lspEnabled ? lspPort : null,
    languageId: lspLanguageId ?? 'plaintext',
    projectRoot: activeProjectId ?? '',
    filePath: selectedFilePath,
    monaco,
    editor: editorRef.current,
    openFile: handleOpenFile,
  })

  // Fetch file content when a tab is activated (if not cached)
  useEffect(() => {
    if (!selectedFilePath) return
    const cached = contentCache.current.get(selectedFilePath)
    if (cached) {
      setContent(cached.content)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    window.electronAPI.file.readFile(selectedFilePath).then((data) => {
      if (cancelled) return
      contentCache.current.set(selectedFilePath, { content: data, savedContent: data })
      setContent(data)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      const fallback = '// Failed to read file'
      contentCache.current.set(selectedFilePath, { content: fallback, savedContent: fallback })
      setContent(fallback)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedFilePath])

  // Recompute dirty set whenever content changes
  const updateDirty = useCallback((path: string, currentContent: string) => {
    const entry = contentCache.current.get(path)
    if (!entry) return
    entry.content = currentContent
    setDirtyFiles((prev) => {
      const isDirty = entry.content !== entry.savedContent
      const wasDirty = prev.has(path)
      if (isDirty === wasDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined || !selectedFilePath) return
    setContent(value)
    updateDirty(selectedFilePath, value)
  }, [selectedFilePath, updateDirty])

  const handleSave = useCallback(async () => {
    if (!selectedFilePath || saving) return
    const entry = contentCache.current.get(selectedFilePath)
    if (!entry || entry.content === entry.savedContent) return
    setSaving(true)
    try {
      await window.electronAPI.file.writeFile(selectedFilePath, entry.content)
      entry.savedContent = entry.content
      setDirtyFiles((prev) => {
        const next = new Set(prev)
        next.delete(selectedFilePath)
        return next
      })
      // Notify LSP that the document was saved
      window.dispatchEvent(new CustomEvent('lsp:didSave', { detail: { filePath: selectedFilePath } }))
    } catch {
      // Save failed — stays dirty
    } finally {
      setSaving(false)
    }
  }, [selectedFilePath, saving])

  const handleCloseActiveTab = useCallback(() => {
    if (activeProjectId && selectedFilePath) {
      contentCache.current.delete(selectedFilePath)
      closeFile(activeProjectId, selectedFilePath)
    }
  }, [activeProjectId, selectedFilePath, closeFile])

  // Clean up cache entries when files are closed
  useEffect(() => {
    const openSet = new Set(openFiles)
    for (const path of contentCache.current.keys()) {
      if (!openSet.has(path)) {
        contentCache.current.delete(path)
      }
    }
    // Clean dirty set too
    setDirtyFiles((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const path of next) {
        if (!openSet.has(path)) {
          next.delete(path)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [openFiles])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        handleCloseActiveTab()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, handleCloseActiveTab])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  // Memoize dirtyFiles for tab bar to avoid unnecessary rerenders
  const dirtyFilesStable = useMemo(() => dirtyFiles, [dirtyFiles])

  if (openFiles.length === 0) return null

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      <EditorTabBar dirtyFiles={dirtyFilesStable} />
      {saving && (
        <div className="absolute top-10 right-2 text-[11px] text-zinc-500 z-10">Saving...</div>
      )}
      <div className="flex-1 min-h-0">
        {!selectedFilePath ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-[13px]">No file selected</div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-[13px]">Loading...</div>
        ) : (
          <Editor
            height="100%"
            language={getLang(selectedFilePath)}
            value={content}
            path={selectedFilePath}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
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
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  )
}
