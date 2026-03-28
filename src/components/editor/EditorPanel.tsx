import { useEffect, useState, useCallback, useRef } from 'react'
import Editor, { useMonaco, type OnMount } from '@monaco-editor/react'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLspStore } from '../../stores/lspStore'
import { useLspClient } from '../../hooks/useLspClient'
import { trpc } from '../../trpc'
import { getMonacoThemeData } from '../../themes'
import { useResolvedTheme, useCustomThemes } from '../../hooks/useResolvedTheme'
import { DiffViewer } from './DiffViewer'
import { getLang, getFileKind, getMimeType, type FileKind } from '../../utils/lang'

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
  const selectedDiffPath = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.selectedDiffPath ?? null : null
  })
  const openDiffs = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.openDiffs ?? [] : []
  })
  const setActiveDiff = useProjectStore((s) => s.setActiveDiff)
  const closeDiff = useProjectStore((s) => s.closeDiff)
  const closeFile = useProjectStore((s) => s.closeFile)
  const openFile = useProjectStore((s) => s.openFile)
  const themeSetting = useSettingsStore((s) => s.settings.theme)
  const enabledLspLanguages = useSettingsStore((s) => s.settings.enabledLspLanguages)
  const { customThemes } = useCustomThemes()
  const { theme: resolvedThemeDef } = useResolvedTheme(themeSetting, customThemes)
  const monacoTheme = resolvedThemeDef.monacoTheme
  const monaco = useMonaco()

  // Register the custom Monaco theme whenever Monaco is ready or the theme changes
  useEffect(() => {
    if (!monaco) return
    monaco.editor.defineTheme(resolvedThemeDef.monacoTheme, getMonacoThemeData(resolvedThemeDef))
    monaco.editor.setTheme(resolvedThemeDef.monacoTheme)
  }, [monaco, resolvedThemeDef])

  const contentCache = useRef(new Map<string, CacheEntry>())
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [binaryDataUrl, setBinaryDataUrl] = useState<string | null>(null)
  const [fileKind, setFileKind] = useState<FileKind>('text')
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
    const kind = getFileKind(selectedFilePath)
    setFileKind(kind)

    // For binary/unreadable files, no loading needed
    if (kind === 'binary') {
      setLoading(false)
      setBinaryDataUrl(null)
      return
    }

    // For media files (image, video, audio, pdf), load as base64
    if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf') {
      let cancelled = false
      setLoading(true)
      setBinaryDataUrl(null)
      trpc.file.readFileBase64.query({ filePath: selectedFilePath }).then((base64) => {
        if (cancelled) return
        const mime = getMimeType(selectedFilePath)
        setBinaryDataUrl(`data:${mime};base64,${base64}`)
        setLoading(false)
      }).catch(() => {
        if (cancelled) return
        setFileKind('binary') // fallback to unreadable
        setLoading(false)
      })
      return () => { cancelled = true }
    }

    // Text files — use existing logic
    const cached = contentCache.current.get(selectedFilePath)
    if (cached) {
      setContent(cached.content)
      setBinaryDataUrl(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    trpc.file.readFile.query({ filePath: selectedFilePath }).then((data) => {
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
    const sub = trpc.file.onChanged.subscribe(undefined, { onData: (event) => {
      if (event.eventType !== 'change') return
      const entry = contentCache.current.get(event.path)
      if (!entry) return // file not open in editor

      trpc.file.readFile.query({ filePath: event.path }).then((diskContent) => {
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
    } })
    return () => sub.unsubscribe()
  }, [dirtyFiles, selectedFilePath])

  // Handle conflict resolution: reload from disk
  const handleConflictReload = useCallback(async (path: string) => {
    try {
      const diskContent = await trpc.file.readFile.query({ filePath: path })
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
      const diskContent = await trpc.file.readFile.query({ filePath: path })
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
      await trpc.file.writeFile.mutate({ filePath: selectedFilePath, content: entry.content })
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
        await trpc.file.writeFile.mutate({ filePath: pendingClose, content: entry.content })
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
      // Cmd+W is now handled globally by useKeyboardShortcuts (tab.close)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, handleCloseActiveTab])

  // Listen for close-tab events from TerminalTabs
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail.path
      requestCloseTab(path)
    }
    window.addEventListener('editor:close-tab', handler)
    return () => window.removeEventListener('editor:close-tab', handler)
  }, [requestCloseTab])

  // Listen for close-active-tab from global shortcut (Cmd+W)
  useEffect(() => {
    const handler = () => handleCloseActiveTab()
    window.addEventListener('editor:close-active-tab', handler)
    return () => window.removeEventListener('editor:close-active-tab', handler)
  }, [handleCloseActiveTab])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleCloseDiff = useCallback(() => {
    if (activeProjectId) {
      if (selectedDiffPath) {
        closeDiff(activeProjectId, selectedDiffPath)
      }
      setActiveDiff(activeProjectId, null)
    }
  }, [activeProjectId, selectedDiffPath, closeDiff, setActiveDiff])

  if (openFiles.length === 0 && openDiffs.length === 0 && !activeDiff) return null

  // Show DiffViewer when a diff tab is selected
  if (selectedDiffPath && activeDiff && activeProjectId) {
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
            className="px-2 py-0.5 rounded bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white transition-colors"
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
        ) : fileKind === 'binary' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <span className="text-[13px]">Cannot read this file</span>
            <span className="text-[11px] text-zinc-600">{selectedFilePath.split('/').pop()}</span>
          </div>
        ) : fileKind === 'image' && binaryDataUrl ? (
          <div className="flex items-center justify-center h-full p-8 overflow-auto">
            <img
              src={binaryDataUrl}
              alt={selectedFilePath.split('/').pop() ?? ''}
              className="max-w-full max-h-full object-contain rounded"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        ) : fileKind === 'video' && binaryDataUrl ? (
          <div className="flex items-center justify-center h-full p-8">
            <video
              src={binaryDataUrl}
              controls
              className="max-w-full max-h-full rounded"
            />
          </div>
        ) : fileKind === 'audio' && binaryDataUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span className="text-[13px] text-zinc-400">{selectedFilePath.split('/').pop()}</span>
            <audio src={binaryDataUrl} controls className="w-80" />
          </div>
        ) : fileKind === 'pdf' && binaryDataUrl ? (
          <iframe
            src={binaryDataUrl}
            className="w-full h-full border-0"
            title={selectedFilePath.split('/').pop() ?? 'PDF'}
          />
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
