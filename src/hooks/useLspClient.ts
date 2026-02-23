import { useEffect, useRef } from 'react'
import type * as monacoNs from 'monaco-editor'
import * as lsp from 'vscode-languageserver-protocol'
import {
  monacoPositionToLsp,
  monacoRangeToLsp,
  lspDiagnosticToMarker,
  lspCompletionToMonaco,
  lspHoverToMonaco,
  lspLocationToMonaco,
  lspRangeToMonaco,
  lspSignatureHelpToMonaco,
  lspDocumentSymbolToMonaco,
  lspSymbolInformationToMonaco,
  lspCodeActionToMonaco,
  lspWorkspaceEditToMonaco,
} from '../lib/lspConversions'
import { useNotificationStore } from '../stores/notificationStore'

type Monaco = typeof monacoNs

interface LspClientOptions {
  port: number | null
  languageId: string
  projectRoot: string
  filePath: string | null
  monaco: Monaco | null
  editor: monacoNs.editor.IStandaloneCodeEditor | null
  /** Callback to open a file in the editor (for go-to-definition cross-file jumps) */
  openFile?: (path: string) => void
}

function filePathToUri(filePath: string): string {
  return `file://${filePath}`
}

function uriToFilePath(uri: string): string {
  return uri.replace(/^file:\/\//, '')
}

function getLanguageId(lang: string): string {
  // Monaco uses "typescript" for both .ts and .tsx, LSP needs the same
  if (lang === 'javascript') return 'javascript'
  if (lang === 'typescript') return 'typescript'
  if (lang === 'python') return 'python'
  if (lang === 'rust') return 'rust'
  if (lang === 'go') return 'go'
  return lang
}

/** Debounce helper for didChange notifications */
function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  debounced.cancel = () => { if (timer) clearTimeout(timer) }
  return debounced as T & { cancel(): void }
}

/**
 * Core LSP client hook. Manages the WebSocket connection, LSP lifecycle,
 * document synchronization, diagnostics, and all IntelliSense providers.
 */
export function useLspClient(options: LspClientOptions): void {
  const { port, languageId, projectRoot, filePath, monaco, editor, openFile } = options
  const wsRef = useRef<WebSocket | null>(null)
  const initializedRef = useRef(false)
  const openDocsRef = useRef(new Set<string>())
  const versionRef = useRef(new Map<string, number>())
  const requestIdRef = useRef(0)
  const pendingRequestsRef = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>())
  const disposablesRef = useRef<monacoNs.IDisposable[]>([])
  const serverCapabilitiesRef = useRef<lsp.ServerCapabilities | null>(null)

  useEffect(() => {
    if (!port || !monaco || !editor || !filePath) return

    // Local non-null binding so TS narrows inside closures
    const m = monaco

    // Capture refs for cleanup (React lint requires this)
    const openDocs = openDocsRef.current
    const versions = versionRef.current
    const pendingRequests = pendingRequestsRef.current

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    wsRef.current = ws
    initializedRef.current = false
    const notify = useNotificationStore.getState().notify

    // --- JSON-RPC helpers ---
    function sendRequest(method: string, params: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = ++requestIdRef.current
        pendingRequestsRef.current.set(id, { resolve, reject })
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      })
    }

    function sendNotification(method: string, params: unknown): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }))
      }
    }

    // --- Message handling ---
    ws.onmessage = (event) => {
      let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } }
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : '')
      } catch {
        return
      }

      // Response to a request we sent
      if (msg.id !== undefined && pendingRequestsRef.current.has(msg.id)) {
        const pending = pendingRequestsRef.current.get(msg.id)!
        pendingRequestsRef.current.delete(msg.id)
        if (msg.error) {
          pending.reject(new Error(msg.error.message))
        } else {
          pending.resolve(msg.result)
        }
        return
      }

      // Server notification
      if (msg.method === 'textDocument/publishDiagnostics') {
        const params = msg.params as lsp.PublishDiagnosticsParams
        const path = uriToFilePath(params.uri)
        const markers = params.diagnostics.map(lspDiagnosticToMarker)
        const model = m.editor.getModels().find((em) => em.uri.path === path)
        if (model) {
          m.editor.setModelMarkers(model, 'lsp', markers)
        }
      }

      // Server request (e.g., workspace/applyEdit, window/showMessage)
      if (msg.method === 'window/showMessage' && msg.params) {
        const p = msg.params as lsp.ShowMessageParams
        const typeMap: Record<number, 'error' | 'warning' | 'info'> = {
          1: 'error', 2: 'warning', 3: 'info', 4: 'info',
        }
        notify(typeMap[p.type] ?? 'info', 'Language Server', p.message)
      }

      if (msg.method === 'workspace/applyEdit' && msg.id !== undefined) {
        const p = msg.params as lsp.ApplyWorkspaceEditParams
        const workspaceEdit = lspWorkspaceEditToMonaco(p.edit, m)
        // Apply all text edits to their respective models
        for (const edit of workspaceEdit.edits) {
          if ('textEdit' in edit) {
            const model = m.editor.getModels().find(
              (em) => em.uri.toString() === edit.resource.toString()
            )
            if (model) {
              model.pushEditOperations([], [{
                range: edit.textEdit.range as monacoNs.IRange,
                text: edit.textEdit.text,
              }], () => null)
            }
          }
        }
        // Respond to the server's request
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { applied: true } }))
      }
    }

    // --- LSP Initialize ---
    ws.onopen = async () => {
      try {
        const initResult = await sendRequest('initialize', {
          processId: null,
          rootUri: filePathToUri(projectRoot),
          capabilities: {
            textDocument: {
              synchronization: {
                dynamicRegistration: false,
                willSave: false,
                willSaveWaitUntil: false,
                didSave: true,
              },
              completion: {
                completionItem: {
                  snippetSupport: true,
                  documentationFormat: ['markdown', 'plaintext'],
                  labelDetailsSupport: true,
                },
              },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'] } },
              definition: {},
              references: {},
              documentSymbol: { hierarchicalDocumentSymbolSupport: true },
              formatting: {},
              rename: { prepareSupport: true },
              codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } } },
              publishDiagnostics: { relatedInformation: true },
            },
            workspace: {
              applyEdit: true,
              workspaceFolders: true,
            },
          },
          workspaceFolders: [{ uri: filePathToUri(projectRoot), name: projectRoot.split('/').pop() ?? '' }],
        } satisfies lsp.InitializeParams) as lsp.InitializeResult

        serverCapabilitiesRef.current = initResult.capabilities
        sendNotification('initialized', {})
        initializedRef.current = true

        // Open the current document
        openDocument(filePath)

        // Register all providers
        registerProviders()
      } catch (err) {
        console.error('[LSP] Initialize failed:', err)
      }
    }

    ws.onerror = (err) => {
      console.error('[LSP] WebSocket error:', err)
    }

    ws.onclose = () => {
      initializedRef.current = false
      // Reject all pending requests
      for (const [, pending] of pendingRequestsRef.current) {
        pending.reject(new Error('WebSocket closed'))
      }
      pendingRequestsRef.current.clear()
    }

    // --- Document sync ---
    function openDocument(path: string): void {
      if (!initializedRef.current || openDocsRef.current.has(path)) return
      const model = m.editor.getModels().find((em) => em.uri.path === path)
      if (!model) return
      openDocsRef.current.add(path)
      versionRef.current.set(path, 1)
      sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: filePathToUri(path),
          languageId: getLanguageId(languageId),
          version: 1,
          text: model.getValue(),
        },
      } satisfies lsp.DidOpenTextDocumentParams)
    }

    function closeDocument(path: string): void {
      if (!openDocsRef.current.has(path)) return
      openDocsRef.current.delete(path)
      versionRef.current.delete(path)
      sendNotification('textDocument/didClose', {
        textDocument: { uri: filePathToUri(path) },
      } satisfies lsp.DidCloseTextDocumentParams)
    }

    const sendDidChange = debounce((path: string, text: string) => {
      if (!initializedRef.current || !openDocsRef.current.has(path)) return
      const version = (versionRef.current.get(path) ?? 0) + 1
      versionRef.current.set(path, version)
      sendNotification('textDocument/didChange', {
        textDocument: { uri: filePathToUri(path), version },
        contentChanges: [{ text }],
      } satisfies lsp.DidChangeTextDocumentParams)
    }, 300)

    // Listen for editor content changes
    const changeDisposable = editor.onDidChangeModelContent(() => {
      if (!filePath) return
      const model = editor.getModel()
      if (model) {
        sendDidChange(filePath, model.getValue())
      }
    })

    // --- Provider registration ---
    function registerProviders(): void {
      const caps = serverCapabilitiesRef.current
      if (!caps) return

      // Completions
      if (caps.completionProvider) {
        const d = m.languages.registerCompletionItemProvider(languageId, {
          triggerCharacters: caps.completionProvider.triggerCharacters ?? ['.', '"', "'", '/', '@', '<'],
          provideCompletionItems: async (model, position) => {
            if (!initializedRef.current) return { suggestions: [] }
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/completion', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
              } satisfies lsp.CompletionParams)

              if (!result) return { suggestions: [] }

              const items: lsp.CompletionItem[] = Array.isArray(result)
                ? result
                : (result as lsp.CompletionList).items

              const word = model.getWordUntilPosition(position)
              const range: monacoNs.IRange = {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
              }

              return {
                suggestions: items.map((item) => lspCompletionToMonaco(item, range)),
                incomplete: !Array.isArray(result) && (result as lsp.CompletionList).isIncomplete,
              }
            } catch {
              return { suggestions: [] }
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Hover
      if (caps.hoverProvider) {
        const d = m.languages.registerHoverProvider(languageId, {
          provideHover: async (model, position) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/hover', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
              } satisfies lsp.HoverParams) as lsp.Hover | null

              if (!result) return null
              return lspHoverToMonaco(result, m)
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Go-to-Definition
      if (caps.definitionProvider) {
        const d = m.languages.registerDefinitionProvider(languageId, {
          provideDefinition: async (model, position) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/definition', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
              } satisfies lsp.DefinitionParams) as lsp.Location | lsp.Location[] | lsp.LocationLink[] | null

              if (!result) return null

              const locations = Array.isArray(result) ? result : [result]
              return locations.map((loc) => {
                if ('targetUri' in loc) {
                  // LocationLink
                  const targetPath = uriToFilePath(loc.targetUri)
                  if (targetPath !== model.uri.path && openFile) {
                    openFile(targetPath)
                  }
                  return {
                    uri: m.Uri.parse(loc.targetUri),
                    range: lspRangeToMonaco(loc.targetSelectionRange),
                  }
                }
                // Location
                const targetPath = uriToFilePath(loc.uri)
                if (targetPath !== model.uri.path && openFile) {
                  openFile(targetPath)
                }
                return lspLocationToMonaco(loc as lsp.Location, m)
              })
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Signature Help
      if (caps.signatureHelpProvider) {
        const d = m.languages.registerSignatureHelpProvider(languageId, {
          signatureHelpTriggerCharacters: caps.signatureHelpProvider.triggerCharacters ?? ['(', ','],
          signatureHelpRetriggerCharacters: caps.signatureHelpProvider.retriggerCharacters ?? [')'],
          provideSignatureHelp: async (model, position) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/signatureHelp', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
              } satisfies lsp.SignatureHelpParams) as lsp.SignatureHelp | null

              if (!result) return null
              return lspSignatureHelpToMonaco(result)
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // References
      if (caps.referencesProvider) {
        const d = m.languages.registerReferenceProvider(languageId, {
          provideReferences: async (model, position, context) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/references', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
                context: { includeDeclaration: context.includeDeclaration },
              } satisfies lsp.ReferenceParams) as lsp.Location[] | null

              if (!result) return null
              return result.map((loc) => lspLocationToMonaco(loc, m))
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Rename
      if (caps.renameProvider) {
        const d = m.languages.registerRenameProvider(languageId, {
          provideRenameEdits: async (model, position, newName) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/rename', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                position: monacoPositionToLsp(position),
                newName,
              } satisfies lsp.RenameParams) as lsp.WorkspaceEdit | null

              if (!result) return null
              return lspWorkspaceEditToMonaco(result, m)
            } catch {
              return { edits: [] }
            }
          },
          resolveRenameLocation: typeof caps.renameProvider === 'object' && caps.renameProvider.prepareProvider
            ? async (model, position) => {
              if (!initializedRef.current) return { range: new m.Range(1, 1, 1, 1), text: '' }
              openDocument(model.uri.path)
              try {
                const result = await sendRequest('textDocument/prepareRename', {
                  textDocument: { uri: filePathToUri(model.uri.path) },
                  position: monacoPositionToLsp(position),
                } satisfies lsp.PrepareRenameParams) as lsp.Range | { range: lsp.Range; placeholder: string } | null

                if (!result) return { range: new m.Range(1, 1, 1, 1), text: '', rejectReason: 'Cannot rename this symbol' }
                if ('range' in result && 'placeholder' in result) {
                  return { range: lspRangeToMonaco(result.range) as monacoNs.Range, text: result.placeholder }
                }
                const range = result as lsp.Range
                const monacoRange = lspRangeToMonaco(range)
                return { range: monacoRange as monacoNs.Range, text: model.getValueInRange(monacoRange) }
              } catch {
                return { range: new m.Range(1, 1, 1, 1), text: '', rejectReason: 'Cannot rename this symbol' }
              }
            }
            : undefined,
        })
        disposablesRef.current.push(d)
      }

      // Document Symbols
      if (caps.documentSymbolProvider) {
        const d = m.languages.registerDocumentSymbolProvider(languageId, {
          provideDocumentSymbols: async (model) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/documentSymbol', {
                textDocument: { uri: filePathToUri(model.uri.path) },
              } satisfies lsp.DocumentSymbolParams) as lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null

              if (!result || result.length === 0) return null
              // Check if DocumentSymbol (has range) or SymbolInformation (has location)
              if ('range' in result[0]) {
                return (result as lsp.DocumentSymbol[]).map(lspDocumentSymbolToMonaco)
              }
              return (result as lsp.SymbolInformation[]).map(lspSymbolInformationToMonaco)
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Document Formatting
      if (caps.documentFormattingProvider) {
        const d = m.languages.registerDocumentFormattingEditProvider(languageId, {
          provideDocumentFormattingEdits: async (model) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/formatting', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                options: {
                  tabSize: model.getOptions().tabSize,
                  insertSpaces: model.getOptions().insertSpaces,
                },
              } satisfies lsp.DocumentFormattingParams) as lsp.TextEdit[] | null

              if (!result) return null
              return result.map((te) => ({
                range: lspRangeToMonaco(te.range),
                text: te.newText,
              }))
            } catch {
              return null
            }
          },
        })
        disposablesRef.current.push(d)
      }

      // Code Actions
      if (caps.codeActionProvider) {
        const d = m.languages.registerCodeActionProvider(languageId, {
          provideCodeActions: async (model, range, context) => {
            if (!initializedRef.current) return null
            openDocument(model.uri.path)
            try {
              const result = await sendRequest('textDocument/codeAction', {
                textDocument: { uri: filePathToUri(model.uri.path) },
                range: monacoRangeToLsp(range),
                context: {
                  diagnostics: context.markers.map((marker) => ({
                    range: {
                      start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
                      end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
                    },
                    message: marker.message,
                    severity: marker.severity === 8 ? 1 : marker.severity === 4 ? 2 : marker.severity === 2 ? 3 : 4,
                    source: marker.source ?? undefined,
                    code: marker.code ? (typeof marker.code === 'object' ? marker.code.value : marker.code) : undefined,
                  })),
                },
              } satisfies lsp.CodeActionParams) as (lsp.Command | lsp.CodeAction)[] | null

              if (!result) return { actions: [], dispose: () => {} }
              const actions = result
                .filter((r): r is lsp.CodeAction => 'title' in r && 'kind' in r)
                .map(lspCodeActionToMonaco)
              return { actions, dispose: () => {} }
            } catch {
              return { actions: [], dispose: () => {} }
            }
          },
        })
        disposablesRef.current.push(d)
      }
    }

    // --- didSave notification ---
    // We listen on the model's content change to detect saves.
    // Actually, we'll expose sendDidSave so EditorPanel can call it.
    // For now, we can't easily detect saves from here, so we'll set up
    // a method the parent can call. We'll use a different approach:
    // store sendDidSave on a ref that EditorPanel reads.
    // Since this is a hook, we can set it on the window for simplicity.
    // Better: we use a MutationObserver pattern. Actually, the simplest
    // approach is to handle didSave via a custom event.
    const handleDidSave = (e: Event) => {
      const detail = (e as CustomEvent<{ filePath: string }>).detail
      if (!initializedRef.current || !openDocsRef.current.has(detail.filePath)) return
      const model = m.editor.getModels().find((em) => em.uri.path === detail.filePath)
      sendNotification('textDocument/didSave', {
        textDocument: { uri: filePathToUri(detail.filePath) },
        text: model?.getValue(),
      })
    }
    window.addEventListener('lsp:didSave', handleDidSave)

    // --- Cleanup ---
    return () => {
      sendDidChange.cancel()
      changeDisposable.dispose()
      window.removeEventListener('lsp:didSave', handleDidSave)

      // Dispose all registered providers
      for (const d of disposablesRef.current) {
        d.dispose()
      }
      disposablesRef.current = []

      // Close all open documents
      for (const doc of openDocs) {
        closeDocument(doc)
      }
      openDocs.clear()
      versions.clear()

      // Clear LSP markers from all models
      for (const model of m.editor.getModels()) {
        m.editor.setModelMarkers(model, 'lsp', [])
      }

      // Send shutdown + exit, then close WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        sendRequest('shutdown', null)
          .then(() => sendNotification('exit', null))
          .catch(() => {})
          .finally(() => ws.close())
      } else {
        ws.close()
      }

      wsRef.current = null
      initializedRef.current = false
      serverCapabilitiesRef.current = null
      pendingRequests.clear()
    }
    // We intentionally use port+filePath+languageId as deps.
    // When these change, we tear down and reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, filePath, languageId, projectRoot, monaco, editor])
}
