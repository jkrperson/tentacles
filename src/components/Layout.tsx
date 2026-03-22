import { useCallback, lazy, Suspense } from 'react'
import { FileTree } from './sidebar/FileTree'
import { GitPanel } from './sidebar/git/GitPanel'
import { MediaPanel } from './sidebar/MediaPanel'
import { TerminalView } from './terminal/TerminalView'
import { TerminalBottomPanel } from './terminal/TerminalBottomPanel'
import { AgentSidebar } from './sessions/AgentSidebar'
import { WorkspacePage } from './workspace/WorkspacePage'
import { useSettingsStore } from '../stores/settingsStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useUIStore } from '../stores/uiStore'
import { useDrag } from '../hooks/useDrag'
import { useFileWatcher } from '../hooks/useFileWatcher'

const ProjectSettingsPage = lazy(() =>
  import('./projectSettings/ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage }))
)

export function Layout() {
  useFileWatcher()
  const enableMediaPanel = useSettingsStore((s) => s.settings.enableMediaPanel)

  const leftDrag = useDrag({ axis: 'x', initial: 240, min: 180, max: 400 })
  const rightDrag = useDrag({ axis: 'x', initial: 260, min: 180, max: 450, invert: true })
  const bottomDrag = useDrag({ axis: 'y', initial: 220, min: 100, max: 600, invert: true })
  const mediaDrag = useDrag({ axis: 'y', initial: 250, min: 100, max: 500, invert: true })

  const isDragging = leftDrag.isDragging || rightDrag.isDragging || bottomDrag.isDragging || mediaDrag.isDragging

  const bottomExpanded = useTerminalStore((s) => s.bottomPanelExpanded)
  const setBottomExpanded = useTerminalStore((s) => s.setBottomPanelExpanded)
  const rightVisible = useUIStore((s) => s.rightSidebarVisible)
  const setRightVisible = useUIStore((s) => s.setRightSidebarVisible)
  const rightTab = useUIStore((s) => s.rightSidebarTab)
  const setRightTab = useUIStore((s) => s.setRightSidebarTab)
  const centerView = useUIStore((s) => s.centerView)
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const activeProjectSettingsId = useUIStore((s) => s.activeProjectSettingsId)

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
        <div className="absolute inset-y-0 left-0 w-px bg-[var(--t-border)] group-hover:bg-[var(--t-accent)]/50 transition-colors" />
      </div>

      {/* Center column: workspace page OR agents + shell terminals */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {centerView === 'projectSettings' && activeProjectSettingsId ? (
          <Suspense fallback={null}>
            <ProjectSettingsPage projectId={activeProjectSettingsId} />
          </Suspense>
        ) : centerView === 'workspace' && activeWorkspaceId ? (
          <WorkspacePage workspaceId={activeWorkspaceId} />
        ) : (
          <>
            {/* Terminal view */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <TerminalView />
            </div>

            {/* Bottom: Shell terminal panel */}
            {bottomExpanded && (
              <div
                className="group relative h-1 flex-shrink-0 cursor-row-resize"
                onMouseDown={bottomDrag.onMouseDown}
              >
                <div className="absolute inset-x-0 -top-2 -bottom-2" />
                <div className="absolute inset-x-0 top-0 h-px bg-[var(--t-border)] group-hover:bg-[var(--t-accent)]/50 transition-colors" />
              </div>
            )}

            <div className="flex-shrink-0 overflow-hidden" style={{ height: bottomExpanded ? bottomDrag.value : undefined }}>
              <TerminalBottomPanel
                onNewTerminal={handleNewTerminal}
                expanded={bottomExpanded}
                onToggleExpanded={() => setBottomExpanded(!bottomExpanded)}
              />
            </div>
          </>
        )}
      </div>

      {rightVisible && (
        <>
          <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
            onMouseDown={rightDrag.onMouseDown}>
            <div className="absolute inset-y-0 -left-2 -right-2" />
            <div className="absolute inset-y-0 right-0 w-px bg-[var(--t-border)] group-hover:bg-[var(--t-accent)]/50 transition-colors" />
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
                  <div className="absolute inset-x-0 top-0 h-px bg-[var(--t-border)] group-hover:bg-[var(--t-accent)]/50 transition-colors" />
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
