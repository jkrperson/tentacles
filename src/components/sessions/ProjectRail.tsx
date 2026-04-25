import { useCallback, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore, sessionBelongsToProject } from '../../stores/workspaceStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useUIStore } from '../../stores/uiStore'
import { PROJECT_COLORS } from '../../types'
import { trpc } from '../../trpc'

/** Portaled tooltip that escapes overflow-hidden ancestors */
function RailTooltip({ label, anchorRef, visible }: {
  label: string
  anchorRef: React.RefObject<HTMLElement | null>
  visible: boolean
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!visible || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    })
  }, [visible, anchorRef])

  if (!visible) return null

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none whitespace-nowrap animate-lift-in"
      style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
    >
      <div
        className="relative px-2.5 py-1 text-[11px] font-medium border bg-[var(--t-bg-elevated)] border-[var(--t-hairline-strong)] text-[var(--t-text-secondary)]"
        style={{ boxShadow: 'var(--t-shadow-elevated)' }}
      >
        {label}
        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--t-bg-elevated)] border-l border-b border-[var(--t-hairline-strong)] rotate-45" />
      </div>
    </div>,
    document.body,
  )
}

export function ProjectRail() {
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
  const reorderProjects = useProjectStore((s) => s.reorderProjects)
  const removeProject = useProjectStore((s) => s.removeProject)
  const setProjectColor = useProjectStore((s) => s.setProjectColor)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const showConfirm = useConfirmStore((s) => s.show)
  const switchProject = useUIStore((s) => s.switchProject)

  // Session counts per project
  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [dropPos, setDropPos] = useState<'above' | 'below' | null>(null)

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Tooltip hover state — tracks which item is hovered by key
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current?.contains(e.target as Node)) return
      setCtxMenu(null)
      setColorPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  const handleAddProject = useCallback(async () => {
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) addProject(dir)
  }, [addProject])

  const getRunningCount = useCallback((projectPath: string) => {
    return sessionOrder.filter((id) => {
      const s = sessions.get(id)
      if (!s) return false
      if (!sessionBelongsToProject(s.workspaceId, projectPath, workspaces)) return false
      return s.status === 'running' || s.status === 'needs_input'
    }).length
  }, [sessionOrder, sessions, workspaces])

  const getHasUnread = useCallback((projectPath: string) => {
    return sessionOrder.some((id) => {
      const s = sessions.get(id)
      if (!s) return false
      if (!sessionBelongsToProject(s.workspaceId, projectPath, workspaces)) return false
      return s.hasUnread
    })
  }, [sessionOrder, sessions, workspaces])

  return (
    <div className="flex flex-col items-center h-full bg-[var(--t-bg-base)] py-2 gap-1.5">
      {/* Project icons */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1.5 w-full scrollbar-none">
        {projectOrder.map((path, index) => {
          const project = projects.get(path)
          if (!project) return null
          const isActive = activeProjectId === path
          const runningCount = getRunningCount(path)
          const hasUnread = !isActive && getHasUnread(path)
          const letter = project.icon || project.name[0]?.toUpperCase() || '?'

          return (
            <ProjectIcon
              key={path}
              letter={letter}
              color={project.color}
              name={project.name}
              isActive={isActive}
              hasUnread={hasUnread}
              runningCount={runningCount}
              isDragging={dragIdx === index}
              hovered={hoveredId === path}
              onHover={(h) => setHoveredId(h ? path : null)}
              onClick={() => switchProject(path)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY, projectId: path })
                setColorPickerOpen(false)
              }}
              onDragStart={(e) => {
                setDragIdx(index)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('application/x-rail-project', path)
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('application/x-rail-project')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                const midY = rect.top + rect.height / 2
                setDropIdx(index)
                setDropPos(e.clientY < midY ? 'above' : 'below')
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIdx == null || dropIdx == null) return
                let toIdx = dropPos === 'below' ? dropIdx + 1 : dropIdx
                if (dragIdx < toIdx) toIdx -= 1
                reorderProjects(dragIdx, toIdx)
                setDragIdx(null)
                setDropIdx(null)
                setDropPos(null)
              }}
              onDragEnd={() => {
                setDragIdx(null)
                setDropIdx(null)
                setDropPos(null)
              }}
              dropPosition={dropIdx === index ? dropPos : null}
            />
          )
        })}
      </div>

      {/* Separator */}
      <div className="w-6 border-t border-[var(--t-border)] my-0.5" />

      {/* Add project button */}
      <RailButton
        label="Add project"
        hovered={hoveredId === '__add'}
        onHover={(h) => setHoveredId(h ? '__add' : null)}
        onClick={handleAddProject}
        className="text-[var(--t-text-muted)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] border border-transparent hover:border-[var(--t-border)] bg-[var(--t-bg-elevated)]"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
        </svg>
      </RailButton>

      {/* Settings button */}
      <RailButton
        label="Settings"
        hovered={hoveredId === '__settings'}
        onHover={(h) => setHoveredId(h ? '__settings' : null)}
        onClick={toggleSettings}
        className="text-[var(--t-text-muted)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] border border-transparent hover:border-[var(--t-border)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z"/>
        </svg>
      </RailButton>

      {/* Context menu */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed bg-[var(--t-bg-elevated)] border border-[var(--t-hairline-strong)] z-[9999] py-1 min-w-[160px] animate-lift-in"
          style={{ top: ctxMenu.y, left: ctxMenu.x, boxShadow: 'var(--t-shadow-elevated)' }}
        >
          {/* Color picker */}
          <button
            onClick={() => setColorPickerOpen(!colorPickerOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] transition-colors"
          >
            <div
              className="w-3 h-3"
              style={{ backgroundColor: projects.get(ctxMenu.projectId)?.color }}
            />
            Change color
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className="ml-auto">
              <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L9.58 8 6.3 4.7a1 1 0 0 1 0-1.4z"/>
            </svg>
          </button>

          {colorPickerOpen && (
            <div className="px-3 py-2 grid grid-cols-5 gap-1.5">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setProjectColor(ctxMenu.projectId, color)
                    setCtxMenu(null)
                    setColorPickerOpen(false)
                  }}
                  className={`w-5 h-5 transition-transform hover:scale-110 ${
                    projects.get(ctxMenu.projectId)?.color === color
                      ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-elevated)]'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}

          <div className="mx-2 my-1 border-t border-[var(--t-border)]" />

          <button
            onClick={() => {
              const project = projects.get(ctxMenu.projectId)
              if (!project) return
              setCtxMenu(null)
              showConfirm({
                title: `Remove ${project.name}?`,
                message: 'This will remove the project from the sidebar. No files will be deleted.',
                confirmLabel: 'Remove',
                onConfirm: () => removeProject(project.path),
              })
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--t-status-errored)] hover:bg-[var(--t-bg-hover)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
            Remove project
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

// --- Sub-components ---

interface ProjectIconProps {
  letter: string
  color: string
  name: string
  isActive: boolean
  hasUnread: boolean
  runningCount: number
  isDragging: boolean
  hovered: boolean
  onHover: (hovered: boolean) => void
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  dropPosition: 'above' | 'below' | null
}

function ProjectIcon({
  letter, color, name, isActive, hasUnread, runningCount, isDragging, hovered, onHover,
  onClick, onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd, dropPosition,
}: ProjectIconProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      className="relative flex items-center justify-center w-full group"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drop indicator */}
      {dropPosition === 'above' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-[var(--t-accent)]" />
      )}
      {dropPosition === 'below' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--t-accent)]" />
      )}

      {/* Active / unread indicator pill — springs in on activation */}
      <div
        className="absolute left-0 w-[2px] rounded-r-full"
        style={{
          height: isActive ? 22 : (hasUnread || hovered ? 8 : 0),
          backgroundColor: isActive
            ? 'var(--t-text-primary)'
            : hasUnread
              ? 'var(--t-accent)'
              : 'var(--t-text-faint)',
          opacity: isActive || hasUnread || hovered ? 1 : 0,
          transition: 'height var(--t-dur-base) var(--t-ease-spring), opacity var(--t-dur-base) var(--t-ease-out), background-color var(--t-dur-base) var(--t-ease-out)',
        }}
      />

      {/* Icon button */}
      <button
        ref={btnRef}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={`w-10 h-10 flex items-center justify-center text-sm font-semibold border transition-[background-color,border-color,color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.94] ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={{
          backgroundColor: withAlpha(color, isActive ? 0.22 : 0.12),
          borderColor: withAlpha(color, isActive ? 0.5 : 0.3),
          color: isActive ? color : withAlpha(color, 0.85),
        }}
      >
        {letter}
      </button>

      {/* Running session count badge */}
      {runningCount > 0 && (
        <div
          className="absolute -bottom-0.5 -right-0.5 min-w-4 h-4 px-1 text-[9px] font-semibold flex items-center justify-center border bg-[var(--t-bg-elevated)] text-[var(--t-status-running)]"
          style={{ borderColor: withAlpha(color, 0.35) }}
        >
          {runningCount}
        </div>
      )}

      {/* Portaled tooltip */}
      <RailTooltip label={name} anchorRef={btnRef} visible={hovered} />
    </div>
  )
}

function RailButton({ label, hovered, onHover, onClick, className, children }: {
  label: string
  hovered: boolean
  onHover: (h: boolean) => void
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative flex items-center justify-center">
      <button
        ref={btnRef}
        onClick={onClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={`w-10 h-10 flex items-center justify-center transition-[color,background-color,border-color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.94] ${className ?? ''}`}
      >
        {children}
      </button>
      <RailTooltip label={label} anchorRef={btnRef} visible={hovered} />
    </div>
  )
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
