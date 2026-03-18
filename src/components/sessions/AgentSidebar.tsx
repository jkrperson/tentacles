import { useCallback, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { trpc } from '../../trpc'
import { ProjectGroup } from './ProjectGroup'
import { AgentSpawnDialog } from './AgentSpawnDialog'

export function AgentSidebar() {
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const createSessionInWorkspace = useSessionStore((s) => s.createSessionInWorkspace)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const projects = useProjectStore((s) => s.projects)
  const projectOrder = useProjectStore((s) => s.projectOrder)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const addProject = useProjectStore((s) => s.addProject)
  const ensureMainWorkspace = useWorkspaceStore((s) => s.ensureMainWorkspace)

  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false)
  const [spawnProjectId, setSpawnProjectId] = useState<string>('')
  const [spawnPreselectedWsId, setSpawnPreselectedWsId] = useState<string | undefined>()

  const handleAddProject = useCallback(async () => {
    const dir = await trpc.dialog.selectDirectory.query()
    if (dir) addProject(dir)
  }, [addProject])

  const handleNewAgent = useCallback(() => {
    if (activeProjectId) {
      const ws = ensureMainWorkspace(activeProjectId)
      createSessionInWorkspace(ws.id)
    } else {
      // No project — will prompt directory picker
      useSessionStore.getState().createSession()
    }
  }, [activeProjectId, ensureMainWorkspace, createSessionInWorkspace])

  const handleSpawnAgent = useCallback((workspaceId: string) => {
    // Quick spawn directly — no dialog
    createSessionInWorkspace(workspaceId)
  }, [createSessionInWorkspace])

  const handleNewWorkspace = useCallback((projectId: string) => {
    // Open spawn dialog with "new worktree" context
    setSpawnProjectId(projectId)
    setSpawnPreselectedWsId(undefined)
    setSpawnDialogOpen(true)
  }, [])

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg-surface)]">
      {/* Top section */}
      <div className="px-2 pt-2.5 pb-1.5 flex-shrink-0 space-y-1">
        <div className="flex items-stretch">
          <button
            onClick={handleNewAgent}
            className={`flex-1 flex items-center justify-center gap-2 text-[12px] font-medium text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] bg-[var(--t-bg-elevated)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] px-3 py-1.5 transition-all active:scale-[0.97] ${activeProjectId ? 'border-r-0' : ''}`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            New Agent
          </button>
          {activeProjectId && (
            <button
              onClick={() => {
                setSpawnProjectId(activeProjectId)
                setSpawnPreselectedWsId(undefined)
                setSpawnDialogOpen(true)
              }}
              className="flex items-center justify-center text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] bg-[var(--t-bg-elevated)] hover:bg-[var(--t-bg-hover)] border border-[var(--t-border)] border-l-[var(--t-border)] px-2 transition-all active:scale-[0.95]"
              title="Advanced agent options"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.427 6.427a.75.75 0 0 1 1.06-.073L8 8.578l2.513-2.224a.75.75 0 1 1 .994 1.125l-3 2.654a.75.75 0 0 1-.994 0l-3-2.654a.75.75 0 0 1-.086-1.052z"/>
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleAddProject}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-medium text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] border border-dashed border-[var(--t-border)] px-3 py-1.5 transition-all active:scale-[0.97]"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zM13 5H9.5a.5.5 0 0 1-.5-.5V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/>
            <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
          </svg>
          Add Project
        </button>
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-[var(--t-border)] mb-0.5" />

      {/* Project groups */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {projectOrder.map((path) => {
          const project = projects.get(path)
          if (!project) return null
          return (
            <ProjectGroup
              key={path}
              project={project}
              onSpawnAgent={handleSpawnAgent}
              onNewWorkspace={handleNewWorkspace}
            />
          )
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
      <div className="flex-shrink-0 border-t border-[var(--t-border)] px-2 py-1.5">
        <button
          onClick={toggleSettings}
          className="flex items-center gap-2 text-[12px] text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] px-1.5 py-1.5 transition-all active:scale-[0.97] w-full"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
          </svg>
          Settings
        </button>
      </div>

      {/* Spawn dialog */}
      {spawnDialogOpen && spawnProjectId && (
        <AgentSpawnDialog
          projectId={spawnProjectId}
          isOpen={spawnDialogOpen}
          onClose={() => setSpawnDialogOpen(false)}
          preselectedWorkspaceId={spawnPreselectedWsId}
        />
      )}
    </div>
  )
}
