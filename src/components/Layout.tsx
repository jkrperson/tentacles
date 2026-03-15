import { useState, useCallback } from 'react'
import { FileTree } from './sidebar/FileTree'
import { GitPanel } from './sidebar/GitPanel'
import { MediaPanel } from './sidebar/MediaPanel'
import { TerminalView } from './terminal/TerminalView'
import { TerminalBottomPanel } from './terminal/TerminalBottomPanel'
import { EditorPanel } from './editor/EditorPanel'
import { AgentSidebar } from './sessions/AgentSidebar'
import { useProjectStore } from '../stores/projectStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useDrag } from '../hooks/useDrag'

export function Layout() {
  const enableMediaPanel = useSettingsStore((s) => s.settings.enableMediaPanel)
  const hasOpenFiles = useProjectStore((s) => {
    const apId = s.activeProjectId
    if (!apId) return false
    const cache = s.fileTreeCache.get(apId)
    if (!cache) return false
    return cache.openFiles.length > 0 || cache.activeDiff !== null
  })

  const leftDrag = useDrag({ axis: 'x', initial: 240, min: 180, max: 400 })
  const rightDrag = useDrag({ axis: 'x', initial: 260, min: 180, max: 450, invert: true })
  const editorDrag = useDrag({ axis: 'x', initial: 480, min: 280, max: 800, invert: true })
  const bottomDrag = useDrag({ axis: 'y', initial: 220, min: 100, max: 600, invert: true })
  const mediaDrag = useDrag({ axis: 'y', initial: 250, min: 100, max: 500, invert: true })

  const isDragging = leftDrag.isDragging || rightDrag.isDragging || editorDrag.isDragging || bottomDrag.isDragging || mediaDrag.isDragging

  const bottomExpanded = useTerminalStore((s) => s.bottomPanelExpanded)
  const setBottomExpanded = useTerminalStore((s) => s.setBottomPanelExpanded)
  const [rightVisible, setRightVisible] = useState(true)
  const [rightTab, setRightTab] = useState<'explorer' | 'git'>('explorer')

  const handleNewTerminal = useCallback(() => {
    useTerminalStore.getState().createTerminal()
  }, [])

  return (
    <div className="flex h-full">
      {/* Left: Agent Sidebar */}
      <div className="flex-shrink-0 overflow-hidden" style={{ width: leftDrag.value }}>
        <AgentSidebar />
      </div>

      <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
        onMouseDown={leftDrag.onMouseDown}>
        <div className="absolute inset-y-0 -left-2 -right-2" />
        <div className="absolute inset-y-0 left-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
      </div>

      {/* Center column: agents on top, shell terminals on bottom */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top: Agent terminal + Editor */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            <TerminalView />
          </div>

          {/* Editor Panel */}
          {hasOpenFiles && (
            <>
              <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
                onMouseDown={editorDrag.onMouseDown}>
                <div className="absolute inset-y-0 -left-2 -right-2" />
                <div className="absolute inset-y-0 left-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
              </div>

              <div className="flex-shrink-0 overflow-hidden" style={{ width: editorDrag.value }}>
                <EditorPanel />
              </div>
            </>
          )}
        </div>

        {/* Bottom: Shell terminal panel — always present */}
        {bottomExpanded && (
          <div
            className="group relative h-1 flex-shrink-0 cursor-row-resize"
            onMouseDown={bottomDrag.onMouseDown}
          >
            <div className="absolute inset-x-0 -top-2 -bottom-2" />
            <div className="absolute inset-x-0 top-0 h-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
          </div>
        )}

        <div className="flex-shrink-0 overflow-hidden" style={{ height: bottomExpanded ? bottomDrag.value : undefined }}>
          <TerminalBottomPanel
            onNewTerminal={handleNewTerminal}
            expanded={bottomExpanded}
            onToggleExpanded={() => setBottomExpanded(!bottomExpanded)}
          />
        </div>
      </div>

      {rightVisible && (
        <>
          <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
            onMouseDown={rightDrag.onMouseDown}>
            <div className="absolute inset-y-0 -left-2 -right-2" />
            <div className="absolute inset-y-0 right-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
          </div>

          {/* Right: Tabbed Sidebar */}
          <div className="flex-shrink-0 overflow-hidden flex flex-col" style={{ width: rightDrag.value }}>
            {/* Tab bar */}
            <div className="flex items-center border-b border-[var(--t-border)] flex-shrink-0 bg-[var(--t-bg-surface)]">
              <button
                onClick={() => setRightTab('explorer')}
                className={`flex items-center justify-center w-9 h-8 transition-colors ${
                  rightTab === 'explorer'
                    ? 'text-zinc-300 border-b-2 border-zinc-300'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title="Explorer"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3h5l2 2h5v8H2V3z" />
                </svg>
              </button>
              <button
                onClick={() => setRightTab('git')}
                className={`flex items-center justify-center w-9 h-8 transition-colors ${
                  rightTab === 'git'
                    ? 'text-zinc-300 border-b-2 border-zinc-300'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title="Source Control"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="5" cy="3.5" r="1.5"/>
                  <circle cx="5" cy="12.5" r="1.5"/>
                  <circle cx="11" cy="7" r="1.5"/>
                  <path d="M5 5v6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M9.5 7C8 7 6.5 8 5 9.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {rightTab === 'explorer' ? (
                <FileTree onToggle={() => setRightVisible(false)} />
              ) : (
                <GitPanel onToggle={() => setRightVisible(false)} />
              )}
            </div>

            {/* Media Panel */}
            {enableMediaPanel && (
              <>
                <div
                  className="group relative h-1 flex-shrink-0 cursor-row-resize"
                  onMouseDown={mediaDrag.onMouseDown}
                >
                  <div className="absolute inset-x-0 -top-2 -bottom-2" />
                  <div className="absolute inset-x-0 top-0 h-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
                </div>
                <div className="flex-shrink-0 overflow-hidden relative" style={{ height: mediaDrag.value }}>
                  {isDragging && (
                    <div className="absolute inset-0 z-10" />
                  )}
                  <MediaPanel />
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!rightVisible && (
        <button
          onClick={() => setRightVisible(true)}
          className="flex-shrink-0 w-8 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:bg-[var(--t-bg-hover)] border-l border-[var(--t-border)] transition-colors"
          title="Show file explorer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 3h5l2 2h5v8H2V3z" />
          </svg>
        </button>
      )}
    </div>
  )
}
