import { useState, useRef, useCallback } from 'react'
import { FileTree } from './sidebar/FileTree'
import { TerminalView } from './terminal/TerminalView'
import { TerminalBottomPanel } from './terminal/TerminalBottomPanel'
import { EditorPanel } from './editor/EditorPanel'
import { AgentSidebar } from './sessions/AgentSidebar'
import { useProjectStore } from '../stores/projectStore'

interface LayoutProps {
  onNewSession: () => void
  onNewSessionInProject: (projectPath: string) => void
  onNewTerminal: () => void
}

export function Layout({ onNewSession, onNewSessionInProject, onNewTerminal }: LayoutProps) {
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(260)
  const [editorWidth, setEditorWidth] = useState(480)
  const [bottomHeight, setBottomHeight] = useState(220)
  const [bottomExpanded, setBottomExpanded] = useState(false)
  const [rightVisible, setRightVisible] = useState(true)
  const hasOpenFiles = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? (s.fileTreeCache.get(apId)?.openFiles.length ?? 0) > 0 : false
  })

  const dragging = useRef<'left' | 'right' | 'editor' | 'bottom' | null>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const startWidth = useRef(0)
  const startHeight = useRef(0)

  const onHorizontalMouseDown = useCallback((side: 'left' | 'right' | 'editor', e: React.MouseEvent) => {
    dragging.current = side
    startX.current = e.clientX
    startWidth.current = side === 'left' ? leftWidth : side === 'editor' ? editorWidth : rightWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX.current
      if (dragging.current === 'left') {
        setLeftWidth(Math.max(180, Math.min(400, startWidth.current + delta)))
      } else if (dragging.current === 'editor') {
        setEditorWidth(Math.max(280, Math.min(800, startWidth.current - delta)))
      } else {
        setRightWidth(Math.max(180, Math.min(450, startWidth.current - delta)))
      }
    }

    const onMouseUp = () => {
      dragging.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftWidth, rightWidth, editorWidth])

  const onBottomMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = 'bottom'
    startY.current = e.clientY
    startHeight.current = bottomHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (dragging.current !== 'bottom') return
      const delta = startY.current - ev.clientY
      setBottomHeight(Math.max(100, Math.min(600, startHeight.current + delta)))
    }

    const onMouseUp = () => {
      dragging.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [bottomHeight])

  const handleNewTerminal = useCallback(() => {
    setBottomExpanded(true)
    onNewTerminal()
  }, [onNewTerminal])

  return (
    <div className="flex h-full">
      {/* Left: Agent Sidebar */}
      <div className="flex-shrink-0 overflow-hidden" style={{ width: leftWidth }}>
        <AgentSidebar onNewSession={onNewSession} onNewSessionInProject={onNewSessionInProject} />
      </div>

      <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
        onMouseDown={(e) => onHorizontalMouseDown('left', e)}>
        <div className="absolute inset-y-0 -left-1 -right-1" />
        <div className="absolute inset-y-0 left-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
      </div>

      {/* Center column: agents on top, shell terminals on bottom */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top: Agent terminal + Editor */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            <TerminalView onNewSession={onNewSession} />
          </div>

          {/* Editor Panel */}
          {hasOpenFiles && (
            <>
              <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
                onMouseDown={(e) => onHorizontalMouseDown('editor', e)}>
                <div className="absolute inset-y-0 -left-1 -right-1" />
                <div className="absolute inset-y-0 left-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
              </div>

              <div className="flex-shrink-0 overflow-hidden" style={{ width: editorWidth }}>
                <EditorPanel />
              </div>
            </>
          )}
        </div>

        {/* Bottom: Shell terminal panel — always present */}
        {bottomExpanded && (
          <div
            className="group relative h-1 flex-shrink-0 cursor-row-resize"
            onMouseDown={onBottomMouseDown}
          >
            <div className="absolute inset-x-0 -top-1 -bottom-1" />
            <div className="absolute inset-x-0 top-0 h-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
          </div>
        )}

        <div className="flex-shrink-0 overflow-hidden" style={{ height: bottomExpanded ? bottomHeight : undefined }}>
          <TerminalBottomPanel
            onNewTerminal={handleNewTerminal}
            expanded={bottomExpanded}
            onToggleExpanded={() => setBottomExpanded((v) => !v)}
          />
        </div>
      </div>

      {rightVisible && (
        <>
          <div className="group relative w-1 flex-shrink-0 cursor-col-resize"
            onMouseDown={(e) => onHorizontalMouseDown('right', e)}>
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <div className="absolute inset-y-0 right-0 w-px bg-[var(--t-border)] group-hover:bg-violet-500/50 transition-colors" />
          </div>

          {/* Right: File Explorer */}
          <div className="flex-shrink-0 overflow-hidden" style={{ width: rightWidth }}>
            <FileTree onToggle={() => setRightVisible(false)} />
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
