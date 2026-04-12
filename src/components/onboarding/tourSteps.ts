// TODO: Improve onboarding to be more workflow-driven rather than just highlighting UI regions.
// Ideas:
// - Walk users through an actual workflow (add a project → spawn an agent → create a worktree)
// - Show short animations or GIFs demonstrating each feature in action
// - Reward users for completing onboarding (e.g. confetti, achievement badge, unlock a theme)
// - Track completion of individual steps so users can resume if they close the app mid-tour

export interface TourStep {
  id: string
  title: string
  description: string
  placement: 'right' | 'bottom' | 'left' | 'top'
  /** If set, called before showing the step to ensure the target is visible */
  ensureVisible?: () => void
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'projects',
    title: 'Projects',
    description:
      'Your repositories live here. Click the + button to add a project folder. Each project gets its own icon and color.',
    placement: 'right',
  },
  {
    id: 'sessions',
    title: 'Sessions & Agents',
    description:
      'Spawn AI coding agents here. Click an agent icon to start a new session in the current workspace.',
    placement: 'right',
  },
  {
    id: 'worktrees',
    title: 'Worktrees',
    description:
      'Git worktrees let you work on multiple branches in parallel. Each worktree gets its own agent sessions without conflicts.',
    placement: 'right',
  },
  {
    id: 'terminal',
    title: 'Terminal',
    description:
      'Agent output streams here in real-time. Switch between sessions using the sidebar on the left.',
    placement: 'bottom',
  },
  {
    id: 'shell-terminal',
    title: 'Shell Terminal',
    description:
      'A built-in shell for running commands directly. Toggle it open with the bar at the bottom.',
    placement: 'top',
  },
  {
    id: 'file-tree',
    title: 'File Explorer',
    description:
      'Browse your project files and see git status at a glance. Switch to the git tab to view staged and unstaged changes.',
    placement: 'left',
  },
  {
    id: 'agent-chat',
    title: 'Agent Chat',
    description:
      'Chat directly with an AI assistant about your code. Requires an API key, which you can set in settings.',
    placement: 'bottom',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    description:
      'Track your to-dos with a kanban-style board. Organize work across your projects.',
    placement: 'bottom',
  },
]
