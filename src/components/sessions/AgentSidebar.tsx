import { useCallback, useState, useEffect, useRef } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { ProjectGroup } from './ProjectGroup'

interface AgentSidebarProps {
  onNewSession: () => void
  onNewSessionInProject: (projectPath: string) => void
  onNewSessionInWorktree: (projectPath: string, name?: string) => void
  onResumeSession: (archivedSessionId: string) => void
}

export function AgentSidebar({ onNewSession, onNewSessionInProject, onNewSessionInWorktree, onResumeSession }: AgentSidebarProps) {
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
  const notify = useNotificationStore((s) => s.notify)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeIsRepo, setActiveIsRepo] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Check if active project is a git repo
  useEffect(() => {
    if (!activeProjectId) {
      setActiveIsRepo(false)
      return
    }
    window.electronAPI.git.isRepo(activeProjectId).then(setActiveIsRepo).catch(() => setActiveIsRepo(false))
  }, [activeProjectId])

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setShowNameInput(false)
        setWorktreeName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Focus the input when it appears
  useEffect(() => {
    if (showNameInput) nameInputRef.current?.focus()
  }, [showNameInput])

  const handleAddProject = useCallback(async () => {
    const dir = await window.electronAPI.dialog.selectDirectory()
    if (dir) addProject(dir)
  }, [addProject])

  const handleWorktreeClick = useCallback(() => {
    if (!activeProjectId) {
      notify('warning', 'No active project', 'Select a project first')
      return
    }
    setShowNameInput(true)
  }, [activeProjectId, notify])

  const handleWorktreeSubmit = useCallback(() => {
    if (!activeProjectId) return
    const name = worktreeName.trim() || undefined
    setDropdownOpen(false)
    setShowNameInput(false)
    setWorktreeName('')
    onNewSessionInWorktree(activeProjectId, name)
  }, [activeProjectId, worktreeName, onNewSessionInWorktree])

  const handleWorktreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleWorktreeSubmit()
    } else if (e.key === 'Escape') {
      setShowNameInput(false)
      setWorktreeName('')
    }
  }, [handleWorktreeSubmit])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Top buttons */}
      <div className="p-3 flex-shrink-0 space-y-2">
        <div className="relative flex" ref={dropdownRef}>
          <button
            onClick={onNewSession}
            className="flex-1 py-2 px-3 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white text-[13px] font-medium rounded-l-lg transition-colors"
          >
            New Agent
          </button>
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setShowNameInput(false); setWorktreeName('') }}
            className="py-2 px-1.5 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-r-lg border-l border-white/20 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.427 6.427a.75.75 0 0 1 1.06-.073L8 8.578l2.513-2.224a.75.75 0 1 1 .994 1.125l-3 2.654a.75.75 0 0 1-.994 0l-3-2.654a.75.75 0 0 1-.086-1.052z"/>
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-lg shadow-xl z-50">
              {!showNameInput ? (
                <button
                  onClick={handleWorktreeClick}
                  disabled={!activeIsRepo}
                  className="w-full px-3 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-[var(--t-bg-hover)] disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                    <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
                  </svg>
                  New Agent in Worktree
                </button>
              ) : (
                <div className="px-2 py-1.5">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Worktree name</label>
                  <div className="flex gap-1">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={worktreeName}
                      onChange={(e) => setWorktreeName(e.target.value)}
                      onKeyDown={handleWorktreeKeyDown}
                      placeholder="e.g. add-auth"
                      className="flex-1 min-w-0 px-2 py-1 text-[12px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50"
                    />
                    <button
                      onClick={handleWorktreeSubmit}
                      className="px-2 py-1 text-[11px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
                    >
                      Go
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">Enter to create, Esc to cancel</div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleAddProject}
          className="w-full py-1.5 px-3 text-zinc-400 hover:text-zinc-200 text-[12px] border border-[var(--t-border-input)] hover:border-[var(--t-border-input-hover)] rounded-lg transition-colors"
        >
          Add Project
        </button>
      </div>

      {/* Project groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {projectOrder.map((path) => {
          const project = projects.get(path)
          if (!project) return null
          return (
            <ProjectGroup
              key={path}
              project={project}
              onNewSessionInProject={onNewSessionInProject}
              onNewSessionInWorktree={onNewSessionInWorktree}
              onResumeSession={onResumeSession}
            />
          )
        })}

        {projectOrder.length === 0 && sessionOrder.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-zinc-600 text-[13px] mb-1">No projects yet</div>
            <div className="text-zinc-700 text-[11px]">
              Click "Add Project" or press <kbd className="px-1 py-0.5 bg-[var(--t-border)] rounded text-[10px] text-zinc-500">Cmd+T</kbd> to get started
            </div>
          </div>
        )}
      </div>

      {/* Bottom: settings */}
      <div className="flex-shrink-0 border-t border-[var(--t-border)] px-3 py-2">
        <button
          onClick={toggleSettings}
          className="flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
          </svg>
          Settings
        </button>
      </div>
    </div>
  )
}
