import { useCallback, useState, useEffect, useRef } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { trpc } from '../../trpc'
import { ProjectGroup } from './ProjectGroup'
import type { AgentType } from '../../types'

const AGENT_OPTIONS: { id: AgentType; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'opencode', label: 'opencode' },
]

export function AgentSidebar() {
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const createSession = useSessionStore((s) => s.createSession)
  const createSessionInWorktree = useSessionStore((s) => s.createSessionInWorktree)
  const defaultAgent = useSettingsStore((s) => s.settings.defaultAgent)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
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
    trpc.git.isRepo.query({ dirPath: activeProjectId }).then(setActiveIsRepo).catch(() => setActiveIsRepo(false))
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
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) addProject(dir)
  }, [addProject])

  const handleWorktreeClick = useCallback(() => {
    if (!activeProjectId) return
    setShowNameInput(true)
  }, [activeProjectId])

  const handleWorktreeSubmit = useCallback(() => {
    if (!activeProjectId) return
    const name = worktreeName.trim() || undefined
    setDropdownOpen(false)
    setShowNameInput(false)
    setWorktreeName('')
    createSessionInWorktree(activeProjectId, name)
  }, [activeProjectId, worktreeName, createSessionInWorktree])

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
      {/* Top section */}
      <div className="px-2 pt-2 pb-0.5 flex-shrink-0">
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => createSession()}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-1 py-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
              </svg>
              New Agent
            </button>
            <button
              onClick={() => { setDropdownOpen(!dropdownOpen); setShowNameInput(false); setWorktreeName('') }}
              className="text-zinc-600 hover:text-zinc-300 p-0.5 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.427 6.427a.75.75 0 0 1 1.06-.073L8 8.578l2.513-2.224a.75.75 0 1 1 .994 1.125l-3 2.654a.75.75 0 0 1-.994 0l-3-2.654a.75.75 0 0 1-.086-1.052z"/>
              </svg>
            </button>
          </div>

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded shadow-xl z-50">
              {!showNameInput ? (
                <>
                  {AGENT_OPTIONS.filter((a) => a.id !== defaultAgent).map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => { setDropdownOpen(false); createSession(agent.id) }}
                      className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-[var(--t-bg-hover)] transition-colors flex items-center gap-2"
                    >
                      <span className="w-3 text-center text-[9px] font-bold text-zinc-500 flex-shrink-0">
                        {agent.id === 'claude' ? 'C' : agent.id === 'codex' ? 'X' : 'O'}
                      </span>
                      New {agent.label}
                    </button>
                  ))}
                  <div className="border-t border-[var(--t-border)] my-1" />
                  <button
                    onClick={handleWorktreeClick}
                    disabled={!activeIsRepo}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-[var(--t-bg-hover)] disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                      <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.251 2.251 0 0 1 9.5 3.25zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8 11.878v-1.25a.75.75 0 0 0-1.5 0v1.25a2.25 2.25 0 1 0 1.5 0zM7.25 13a.75.75 0 1 1 .001 1.501A.75.75 0 0 1 7.25 13z"/>
                    </svg>
                    In Worktree
                  </button>
                </>
              ) : (
                <div className="px-2 py-1.5">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Worktree name</label>
                  <div className="flex gap-1">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={worktreeName}
                      onChange={(e) => setWorktreeName(e.target.value)}
                      onKeyDown={handleWorktreeKeyDown}
                      placeholder="e.g. add-auth"
                      className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-[var(--t-bg-base)] border border-[var(--t-border-input)] rounded text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50"
                    />
                    <button
                      onClick={handleWorktreeSubmit}
                      className="px-2 py-1 text-[10px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
                    >
                      Go
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-[var(--t-border)] mb-0.5" />

      {/* Project groups */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {projectOrder.map((path) => {
          const project = projects.get(path)
          if (!project) return null
          return <ProjectGroup key={path} project={project} />
        })}

        {projectOrder.length === 0 && sessionOrder.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="text-zinc-600 text-[12px] mb-1">No projects yet</div>
            <div className="text-zinc-700 text-[11px]">
              Add a project to get started
            </div>
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="flex-shrink-0 border-t border-[var(--t-border)] px-2 py-1.5 flex items-center justify-between">
        <button
          onClick={handleAddProject}
          className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM13 5H9.5a.5.5 0 0 1-.5-.5V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/>
            <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
          </svg>
          Add project
        </button>
        <button
          onClick={toggleSettings}
          className="text-zinc-600 hover:text-zinc-300 p-1 transition-colors"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
