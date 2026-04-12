import { create } from 'zustand'
import { trpc } from '../trpc'
import { DEFAULT_AGENTS } from '../defaultAgents'
import { TOUR_STEPS } from '../components/onboarding/tourSteps'
import { useSettingsStore } from './settingsStore'
import { useUIStore } from './uiStore'
import { useTerminalStore } from './terminalStore'

export type OnboardingPhase = 'idle' | 'wizard' | 'tour' | 'done'
export type WizardStep = 'welcome' | 'tour-offer'

interface OnboardingState {
  phase: OnboardingPhase
  wizardStep: WizardStep
  tourStepIndex: number
  agentStatuses: Record<string, boolean>
  selectedDefaultAgent: string | null
  detectionComplete: boolean

  startOnboarding: () => void
  detectAgents: () => Promise<void>
  setSelectedDefaultAgent: (id: string) => void
  nextWizardStep: () => void
  startTour: () => void
  skipTour: () => void
  nextTourStep: () => void
  prevTourStep: () => void
  endTour: () => void
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  phase: 'idle',
  wizardStep: 'welcome',
  tourStepIndex: 0,
  agentStatuses: {},
  selectedDefaultAgent: null,
  detectionComplete: false,

  startOnboarding: () => {
    set({ phase: 'wizard', wizardStep: 'welcome', detectionComplete: false })
    get().detectAgents()
  },

  detectAgents: async () => {
    const results: Record<string, boolean> = {}
    let firstInstalled: string | null = null

    await Promise.all(
      DEFAULT_AGENTS.map(async (agent) => {
        try {
          const installed = await trpc.app.checkAgentInstalled.query({ command: agent.command })
          results[agent.id] = installed
          if (installed && !firstInstalled) firstInstalled = agent.id
        } catch {
          results[agent.id] = false
        }
      }),
    )

    set((s) => ({
      agentStatuses: results,
      detectionComplete: true,
      selectedDefaultAgent: s.selectedDefaultAgent ?? firstInstalled,
    }))
  },

  setSelectedDefaultAgent: (id) => set({ selectedDefaultAgent: id }),

  nextWizardStep: () => {
    const { wizardStep } = get()
    if (wizardStep === 'welcome') {
      set({ wizardStep: 'tour-offer' })
    }
  },

  startTour: () => {
    set({ phase: 'tour', tourStepIndex: 0 })
  },

  skipTour: () => {
    completeOnboarding(get)
  },

  nextTourStep: () => {
    const { tourStepIndex } = get()
    if (tourStepIndex < TOUR_STEPS.length - 1) {
      const nextIndex = tourStepIndex + 1
      ensureStepVisible(nextIndex)
      set({ tourStepIndex: nextIndex })
    } else {
      completeOnboarding(get)
    }
  },

  prevTourStep: () => {
    const { tourStepIndex } = get()
    if (tourStepIndex > 0) {
      const prevIndex = tourStepIndex - 1
      ensureStepVisible(prevIndex)
      set({ tourStepIndex: prevIndex })
    }
  },

  endTour: () => {
    completeOnboarding(get)
  },
}))

function completeOnboarding(get: () => OnboardingState) {
  const { selectedDefaultAgent } = get()
  useOnboardingStore.setState({ phase: 'done' })

  const updates: Record<string, unknown> = { hasCompletedOnboarding: true }
  if (selectedDefaultAgent) updates.defaultAgent = selectedDefaultAgent
  useSettingsStore.getState().saveSettings(updates as Partial<import('../types').AppSettings>)
}

/** Ensure the target UI element for a tour step is visible */
function ensureStepVisible(stepIndex: number) {
  const step = TOUR_STEPS[stepIndex]
  if (!step) return

  if (step.id === 'file-tree') {
    useUIStore.getState().setRightSidebarVisible(true)
  } else if (step.id === 'shell-terminal') {
    useTerminalStore.getState().setBottomPanelExpanded(true)
  }
}
