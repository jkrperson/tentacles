/**
 * Pure conversion functions between LSP types (0-based) and Monaco types (1-based).
 */
import type * as lsp from 'vscode-languageserver-protocol'
import type * as monacoNs from 'monaco-editor'

type Monaco = typeof monacoNs

// --- Position / Range ---

export function monacoPositionToLsp(pos: monacoNs.IPosition): lsp.Position {
  return { line: pos.lineNumber - 1, character: pos.column - 1 }
}

export function lspPositionToMonaco(pos: lsp.Position): monacoNs.IPosition {
  return { lineNumber: pos.line + 1, column: pos.character + 1 }
}

export function lspRangeToMonaco(range: lsp.Range): monacoNs.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

export function monacoRangeToLsp(range: monacoNs.IRange): lsp.Range {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  }
}

// --- Diagnostics ---

const SEVERITY_MAP: Record<number, number> = {
  1: 8, // Error
  2: 4, // Warning
  3: 2, // Information
  4: 1, // Hint
}

export function lspDiagnosticToMarker(diag: lsp.Diagnostic): monacoNs.editor.IMarkerData {
  return {
    severity: SEVERITY_MAP[diag.severity ?? 1] ?? 8,
    message: diag.message,
    startLineNumber: diag.range.start.line + 1,
    startColumn: diag.range.start.character + 1,
    endLineNumber: diag.range.end.line + 1,
    endColumn: diag.range.end.character + 1,
    source: diag.source,
    code: typeof diag.code === 'number' || typeof diag.code === 'string' ? String(diag.code) : undefined,
  }
}

// --- Completions ---

// LSP CompletionItemKind -> Monaco CompletionItemKind
const COMPLETION_KIND_MAP: Record<number, number> = {
  1: 18, // Text
  2: 1,  // Method
  3: 1,  // Function
  4: 8,  // Constructor
  5: 4,  // Field
  6: 5,  // Variable
  7: 7,  // Class
  8: 8,  // Interface
  9: 0,  // Module
  10: 9, // Property
  11: 12, // Unit
  12: 13, // Value
  13: 15, // Enum
  14: 17, // Keyword
  15: 27, // Snippet
  16: 19, // Color
  17: 20, // File
  18: 18, // Reference
  19: 23, // Folder
  20: 16, // EnumMember
  21: 14, // Constant
  22: 6,  // Struct
  23: 24, // Event
  24: 11, // Operator
  25: 25, // TypeParameter
}

export function lspCompletionToMonaco(
  item: lsp.CompletionItem,
  range: monacoNs.IRange,
): monacoNs.languages.CompletionItem {
  const insertText = item.insertText ?? item.label
  const isSnippet = item.insertTextFormat === 2

  let label: string | { label: string; description?: string; detail?: string }
  if (typeof item.label === 'string') {
    label = item.label
  } else {
    const l = item.label as unknown as { label: string; description?: string; detail?: string }
    label = { label: l.label, description: l.description, detail: l.detail }
  }

  return {
    label,
    kind: COMPLETION_KIND_MAP[item.kind ?? 1] ?? 18,
    insertText,
    insertTextRules: isSnippet ? 4 : 0, // InsertAsSnippet = 4
    range,
    detail: item.detail,
    documentation: item.documentation
      ? typeof item.documentation === 'string'
        ? item.documentation
        : { value: item.documentation.value }
      : undefined,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
  }
}

// --- Hover ---

export function lspHoverToMonaco(hover: lsp.Hover, monaco: Monaco): monacoNs.languages.Hover {
  const contents: monacoNs.IMarkdownString[] = []

  if (Array.isArray(hover.contents)) {
    for (const c of hover.contents) {
      if (typeof c === 'string') {
        contents.push({ value: c })
      } else {
        contents.push({ value: `\`\`\`${c.language}\n${c.value}\n\`\`\`` })
      }
    }
  } else if (typeof hover.contents === 'string') {
    contents.push({ value: hover.contents })
  } else if ('kind' in hover.contents) {
    contents.push({ value: hover.contents.value })
  } else {
    contents.push({ value: `\`\`\`${hover.contents.language}\n${hover.contents.value}\n\`\`\`` })
  }

  return {
    contents,
    range: hover.range ? new monaco.Range(
      hover.range.start.line + 1,
      hover.range.start.character + 1,
      hover.range.end.line + 1,
      hover.range.end.character + 1,
    ) : undefined,
  }
}

// --- Locations (go-to-definition, references) ---

export function lspLocationToMonaco(loc: lsp.Location, monaco: Monaco): monacoNs.languages.Location {
  return {
    uri: monaco.Uri.parse(loc.uri),
    range: lspRangeToMonaco(loc.range),
  }
}

// --- Symbols ---

const SYMBOL_KIND_MAP: Record<number, number> = {
  1: 0,  // File
  2: 1,  // Module
  3: 2,  // Namespace
  4: 3,  // Package
  5: 4,  // Class
  6: 5,  // Method
  7: 9,  // Property
  8: 7,  // Field
  9: 8,  // Constructor
  10: 15, // Enum
  11: 10, // Interface
  12: 11, // Function
  13: 12, // Variable
  14: 13, // Constant
  15: 14, // String
  16: 15, // Number
  17: 16, // Boolean
  18: 17, // Array
  19: 18, // Object
  20: 19, // Key
  21: 20, // Null
  22: 16, // EnumMember
  23: 21, // Struct
  24: 22, // Event
  25: 23, // Operator
  26: 24, // TypeParameter
}

export function lspDocumentSymbolToMonaco(
  sym: lsp.DocumentSymbol,
): monacoNs.languages.DocumentSymbol {
  return {
    name: sym.name,
    detail: sym.detail ?? '',
    kind: SYMBOL_KIND_MAP[sym.kind] ?? 12,
    tags: [],
    range: lspRangeToMonaco(sym.range),
    selectionRange: lspRangeToMonaco(sym.selectionRange),
    children: sym.children?.map(lspDocumentSymbolToMonaco),
  }
}

export function lspSymbolInformationToMonaco(
  sym: lsp.SymbolInformation,
): monacoNs.languages.DocumentSymbol {
  return {
    name: sym.name,
    detail: '',
    kind: SYMBOL_KIND_MAP[sym.kind] ?? 12,
    tags: [],
    range: lspRangeToMonaco(sym.location.range),
    selectionRange: lspRangeToMonaco(sym.location.range),
  }
}

// --- Signature Help ---

export function lspSignatureHelpToMonaco(
  sh: lsp.SignatureHelp,
): monacoNs.languages.SignatureHelpResult {
  return {
    value: {
      signatures: sh.signatures.map((sig) => ({
        label: sig.label,
        documentation: sig.documentation
          ? typeof sig.documentation === 'string'
            ? sig.documentation
            : { value: sig.documentation.value }
          : undefined,
        parameters: sig.parameters?.map((p) => ({
          label: p.label,
          documentation: p.documentation
            ? typeof p.documentation === 'string'
              ? p.documentation
              : { value: p.documentation.value }
            : undefined,
        })) ?? [],
      })),
      activeSignature: sh.activeSignature ?? 0,
      activeParameter: sh.activeParameter ?? 0,
    },
    dispose: () => {},
  }
}

// --- Code Actions ---

const CODE_ACTION_KIND_MAP: Record<string, string> = {
  '': 'quickfix',
  'quickfix': 'quickfix',
  'refactor': 'refactor',
  'refactor.extract': 'refactor.extract',
  'refactor.inline': 'refactor.inline',
  'refactor.rewrite': 'refactor.rewrite',
  'source': 'source',
  'source.organizeImports': 'source.organizeImports',
}

export function lspCodeActionToMonaco(
  action: lsp.CodeAction,
): monacoNs.languages.CodeAction {
  return {
    title: action.title,
    kind: action.kind ? CODE_ACTION_KIND_MAP[action.kind] ?? action.kind : undefined,
    diagnostics: action.diagnostics?.map(lspDiagnosticToMarker),
    isPreferred: action.isPreferred,
  }
}

// --- Workspace Edit ---

export function lspWorkspaceEditToMonaco(
  edit: lsp.WorkspaceEdit,
  monaco: Monaco,
): monacoNs.languages.WorkspaceEdit {
  const edits: monacoNs.languages.IWorkspaceTextEdit[] = []

  if (edit.changes) {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      for (const te of textEdits) {
        edits.push({
          resource: monaco.Uri.parse(uri),
          textEdit: {
            range: lspRangeToMonaco(te.range),
            text: te.newText,
          },
          versionId: undefined,
        })
      }
    }
  }

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('textDocument' in change) {
        for (const te of change.edits) {
          if ('range' in te) {
            edits.push({
              resource: monaco.Uri.parse(change.textDocument.uri),
              textEdit: {
                range: lspRangeToMonaco(te.range),
                text: te.newText,
              },
              versionId: undefined,
            })
          }
        }
      }
    }
  }

  return { edits }
}
