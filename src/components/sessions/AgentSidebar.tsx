import { useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { ProjectGroup } from './ProjectGroup'

interface AgentSidebarProps {
  onNewSession: () => void
  onNewSessionInProject: (projectPath: string) => void
}

export function AgentSidebar({ onNewSession, onNewSessionInProject }: AgentSidebarProps) {
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const addProject = useProjectStore((s) => s.addProject)

  const handleAddProject = useCallback(async () => {
    const dir = await window.electronAPI.dialog.selectDirectory()
    if (dir) addProject(dir)
  }, [addProject])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Top buttons */}
      <div className="p-3 flex-shrink-0 space-y-2">
        <button
          onClick={onNewSession}
          className="w-full py-2 px-3 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white text-[13px] font-medium rounded-lg transition-colors"
        >
          New Agent
        </button>
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
