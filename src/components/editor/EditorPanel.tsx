import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Editor, { useMonaco, type OnMount } from '@monaco-editor/react'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLspStore } from '../../stores/lspStore'
import { useLspClient } from '../../hooks/useLspClient'
import { themes, getMonacoThemeData } from '../../themes'
import { EditorTabBar } from './EditorTabBar'
import { DiffViewer } from './DiffViewer'
import { getLang } from '../../utils/lang'

/** Maps Monaco language IDs to LSP server language IDs */
const LSP_LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'typescript', // typescript-language-server handles JS too
  python: 'python',
  rust: 'rust',
  go: 'go',
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
  const activeDiff = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.activeDiff ?? null : null
  })
  const setActiveDiff = useProjectStore((s) => s.setActiveDiff)
  const closeFile = useProjectStore((s) => s.closeFile)
  const openFile = useProjectStore((s) => s.openFile)
  const themeName = useSettingsStore((s) => s.settings.theme)
  const enabledLspLanguages = useSettingsStore((s) => s.settings.enabledLspLanguages)
  const monacoTheme = (themes[themeName] ?? themes.obsidian).monacoTheme
  const monaco = useMonaco()

  // Register the custom Monaco theme whenever Monaco is ready or the theme changes
  useEffect(() => {
    if (!monaco) return
    const themeDef = themes[themeName] ?? themes.obsidian
    monaco.editor.defineTheme(themeDef.monacoTheme, getMonacoThemeData(themeDef))
    monaco.editor.setTheme(themeDef.monacoTheme)
  }, [monaco, themeName])

  const contentCache = useRef(new Map<string, CacheEntry>())
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())
  const [conflictedFiles, setConflictedFiles] = useState<Set<string>>(new Set())
  const [pendingClose, setPendingClose] = useState<string | null>(null)

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

  // React to external file changes (file watcher)
  useEffect(() => {
    const unsub = window.electronAPI.file.onChanged((event) => {
      if (event.eventType !== 'change') return
      const entry = contentCache.current.get(event.path)
      if (!entry) return // file not open in editor

      window.electronAPI.file.readFile(event.path).then((diskContent) => {
        // Ignore if disk content matches what we already have saved
        if (diskContent === entry.savedContent) return

        if (!dirtyFiles.has(event.path)) {
          // Not dirty — silently reload
          entry.content = diskContent
          entry.savedContent = diskContent
          if (selectedFilePath === event.path) {
            setContent(diskContent)
          }
        } else {
          // Dirty — mark as conflicted
          setConflictedFiles((prev) => {
            if (prev.has(event.path)) return prev
            const next = new Set(prev)
            next.add(event.path)
            return next
          })
        }
      }).catch(() => {
        // File may have been deleted — ignore
      })
    })
    return unsub
  }, [dirtyFiles, selectedFilePath])

  // Handle conflict resolution: reload from disk
  const handleConflictReload = useCallback(async (path: string) => {
    try {
      const diskContent = await window.electronAPI.file.readFile(path)
      const entry = contentCache.current.get(path)
      if (entry) {
        entry.content = diskContent
        entry.savedContent = diskContent
      }
      if (selectedFilePath === path) {
        setContent(diskContent)
      }
      setDirtyFiles((prev) => {
        if (!prev.has(path)) return prev
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      setConflictedFiles((prev) => {
        if (!prev.has(path)) return prev
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    } catch {
      // Read failed — keep current state
    }
  }, [selectedFilePath])

  // Handle conflict resolution: keep user's edits
  const handleConflictKeep = useCallback(async (path: string) => {
    try {
      const diskContent = await window.electronAPI.file.readFile(path)
      const entry = contentCache.current.get(path)
      if (entry) {
        // Update the baseline so dirty diff is correct, keep user edits
        entry.savedContent = diskContent
      }
    } catch {
      // Read failed — ignore
    }
    setConflictedFiles((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

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
      // Clear conflict state on successful save
      setConflictedFiles((prev) => {
        if (!prev.has(selectedFilePath)) return prev
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

  // Actually close a tab (no confirmation)
  const doCloseTab = useCallback((path: string) => {
    if (!activeProjectId) return
    contentCache.current.delete(path)
    setConflictedFiles((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    setPendingClose(null)
    closeFile(activeProjectId, path)
  }, [activeProjectId, closeFile])

  // Request to close a tab — prompts if dirty
  const requestCloseTab = useCallback((path: string) => {
    if (dirtyFiles.has(path)) {
      setPendingClose(path)
    } else {
      doCloseTab(path)
    }
  }, [dirtyFiles, doCloseTab])

  // Close active tab (used by Cmd+W)
  const handleCloseActiveTab = useCallback(() => {
    if (selectedFilePath) requestCloseTab(selectedFilePath)
  }, [selectedFilePath, requestCloseTab])

  // Confirm close: save & close
  const handleConfirmSaveClose = useCallback(async () => {
    if (!pendingClose) return
    const entry = contentCache.current.get(pendingClose)
    if (entry && entry.content !== entry.savedContent) {
      try {
        await window.electronAPI.file.writeFile(pendingClose, entry.content)
        entry.savedContent = entry.content
        setDirtyFiles((prev) => {
          const next = new Set(prev)
          next.delete(pendingClose)
          return next
        })
        window.dispatchEvent(new CustomEvent('lsp:didSave', { detail: { filePath: pendingClose } }))
      } catch {
        // Save failed — don't close
        return
      }
    }
    doCloseTab(pendingClose)
  }, [pendingClose, doCloseTab])

  // Confirm close: discard
  const handleConfirmDiscard = useCallback(() => {
    if (!pendingClose) return
    setDirtyFiles((prev) => {
      const next = new Set(prev)
      next.delete(pendingClose)
      return next
    })
    doCloseTab(pendingClose)
  }, [pendingClose, doCloseTab])

  // Confirm close: cancel
  const handleConfirmCancel = useCallback(() => {
    setPendingClose(null)
  }, [])

  // Clean up cache entries when files are closed
  useEffect(() => {
    const openSet = new Set(openFiles)
    for (const path of contentCache.current.keys()) {
      if (!openSet.has(path)) {
        contentCache.current.delete(path)
      }
    }
    // Clean dirty and conflicted sets too
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
    setConflictedFiles((prev) => {
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

  // Memoize sets for tab bar to avoid unnecessary rerenders
  const dirtyFilesStable = useMemo(() => dirtyFiles, [dirtyFiles])
  const conflictedFilesStable = useMemo(() => conflictedFiles, [conflictedFiles])

  const handleCloseDiff = useCallback(() => {
    if (activeProjectId) setActiveDiff(activeProjectId, null)
  }, [activeProjectId, setActiveDiff])

  if (openFiles.length === 0 && !activeDiff) return null

  // Show DiffViewer when activeDiff is set
  if (activeDiff && activeProjectId) {
    return (
      <DiffViewer
        filePath={activeDiff.filePath}
        staged={activeDiff.staged}
        projectRoot={activeProjectId}
        onClose={handleCloseDiff}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-base)]">
      <EditorTabBar
        dirtyFiles={dirtyFilesStable}
        conflictedFiles={conflictedFilesStable}
        onCloseTab={requestCloseTab}
      />
      {saving && (
        <div className="absolute top-10 right-2 text-[11px] text-zinc-500 z-10">Saving...</div>
      )}
      {/* Conflict banner */}
      {selectedFilePath && conflictedFiles.has(selectedFilePath) && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/40 border-b border-amber-700/50 text-amber-200 text-[12px]">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-amber-400">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
          </svg>
          <span>File changed on disk.</span>
          <button
            onClick={() => handleConflictReload(selectedFilePath)}
            className="px-2 py-0.5 rounded bg-amber-700/50 hover:bg-amber-700/80 text-amber-100 transition-colors"
          >
            Reload
          </button>
          <button
            onClick={() => handleConflictKeep(selectedFilePath)}
            className="px-2 py-0.5 rounded bg-zinc-700/50 hover:bg-zinc-700/80 text-zinc-200 transition-colors"
          >
            Keep yours
          </button>
        </div>
      )}
      {/* Unsaved changes confirmation */}
      {pendingClose && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border-b border-[var(--t-border)] text-zinc-300 text-[12px]">
          <span>Unsaved changes in <strong>{pendingClose.split('/').pop()}</strong>.</span>
          <button
            onClick={handleConfirmSaveClose}
            className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Save &amp; Close
          </button>
          <button
            onClick={handleConfirmDiscard}
            className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleConfirmCancel}
            className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
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
