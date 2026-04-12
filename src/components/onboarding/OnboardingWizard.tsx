import { useEffect } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { DEFAULT_AGENTS } from '../../defaultAgents'
import { AgentIcon } from '../icons/AgentIcons'
import type { AgentIconKey } from '../../types'

export function OnboardingWizard() {
  const wizardStep = useOnboardingStore((s) => s.wizardStep)
  const nextWizardStep = useOnboardingStore((s) => s.nextWizardStep)
  const startTour = useOnboardingStore((s) => s.startTour)
  const skipTour = useOnboardingStore((s) => s.skipTour)
  const agentStatuses = useOnboardingStore((s) => s.agentStatuses)
  const selectedDefaultAgent = useOnboardingStore((s) => s.selectedDefaultAgent)
  const setSelectedDefaultAgent = useOnboardingStore((s) => s.setSelectedDefaultAgent)
  const detectionComplete = useOnboardingStore((s) => s.detectionComplete)

  const hasInstalledAgent = Object.values(agentStatuses).some(Boolean)
  const canContinue = detectionComplete && hasInstalledAgent && selectedDefaultAgent !== null

  // Keyboard: Enter to continue
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && wizardStep === 'welcome' && canContinue) {
        nextWizardStep()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [wizardStep, canContinue, nextWizardStep])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-onboarding-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" />

      {/* Card */}
      <div className="relative border border-[var(--t-border)] bg-[var(--t-bg-elevated)] shadow-2xl max-w-[480px] w-full mx-4 rounded-xl overflow-hidden">
        {wizardStep === 'welcome' ? (
          <WelcomeStep
            agentStatuses={agentStatuses}
            selectedDefaultAgent={selectedDefaultAgent}
            detectionComplete={detectionComplete}
            hasInstalledAgent={hasInstalledAgent}
            canContinue={canContinue}
            onSelectAgent={setSelectedDefaultAgent}
            onContinue={nextWizardStep}
          />
        ) : (
          <TourOfferStep onStartTour={startTour} onSkip={skipTour} />
        )}

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-5">
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              wizardStep === 'welcome' ? 'bg-[var(--t-accent)]' : 'bg-zinc-600'
            }`}
          />
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              wizardStep === 'tour-offer' ? 'bg-[var(--t-accent)]' : 'bg-zinc-600'
            }`}
          />
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({
  agentStatuses,
  selectedDefaultAgent,
  detectionComplete,
  hasInstalledAgent,
  canContinue,
  onSelectAgent,
  onContinue,
}: {
  agentStatuses: Record<string, boolean>
  selectedDefaultAgent: string | null
  detectionComplete: boolean
  hasInstalledAgent: boolean
  canContinue: boolean
  onSelectAgent: (id: string) => void
  onContinue: () => void
}) {
  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-2.5 mb-6">
        <img src="/tentacles.svg" alt="Tentacles" className="w-14 h-14" />
        <h1 className="text-lg font-semibold text-[var(--t-text-primary)] tracking-tight">
          Welcome to Tentacles
        </h1>
        <p className="text-[12px] text-[var(--t-text-tertiary)] text-center max-w-[320px]">
          Tentacles orchestrates AI coding agents. Select which agent you'd like to use as your default.
        </p>
      </div>

      {/* Agent list */}
      <div className="space-y-1.5 mb-6">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Agent CLIs
        </div>
        {DEFAULT_AGENTS.map((agent) => {
          const installed = agentStatuses[agent.id] ?? false
          const isSelected = selectedDefaultAgent === agent.id
          const selectable = installed && detectionComplete

          return (
            <button
              key={agent.id}
              onClick={() => selectable && onSelectAgent(agent.id)}
              disabled={!selectable}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                isSelected
                  ? 'border-[var(--t-accent)] bg-[var(--t-accent)]/10'
                  : 'border-[var(--t-border)] bg-[var(--t-bg-base)] hover:bg-[var(--t-bg-hover)]'
              } ${!selectable ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex-shrink-0 text-[var(--t-text-secondary)]">
                <AgentIcon icon={agent.icon as AgentIconKey} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-[var(--t-text-primary)]">
                  {agent.name}
                </div>
                <div className="text-[10px] text-[var(--t-text-tertiary)]">
                  {agent.command}
                </div>
              </div>
              <div className="flex-shrink-0">
                {!detectionComplete ? (
                  <span className="text-[10px] text-zinc-500">Checking...</span>
                ) : installed ? (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                    Installed
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-full">
                    Not found
                  </span>
                )}
              </div>
              {/* Radio indicator */}
              <div
                className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? 'border-[var(--t-accent)]'
                    : 'border-zinc-600'
                }`}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-[var(--t-accent)]" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Helper text */}
      {detectionComplete && !hasInstalledAgent && (
        <p className="text-[11px] text-amber-400/80 text-center mb-4">
          No agent CLIs detected. Install at least one (e.g. Claude Code) to continue.
        </p>
      )}

      {/* Continue button */}
      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full py-2.5 text-[12px] font-medium bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
      >
        Continue
      </button>
    </div>
  )
}

function TourOfferStep({
  onStartTour,
  onSkip,
}: {
  onStartTour: () => void
  onSkip: () => void
}) {
  return (
    <div className="px-8 py-10">
      <div className="flex flex-col items-center gap-3 mb-8">
        {/* Tour icon */}
        <div className="w-12 h-12 rounded-xl bg-[var(--t-accent)]/15 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--t-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--t-text-primary)] tracking-tight">
          Quick Tour
        </h2>
        <p className="text-[12px] text-[var(--t-text-tertiary)] text-center max-w-[300px] leading-relaxed">
          Want a quick walkthrough of the app? We'll highlight each area and explain what it does. Takes about 30 seconds.
        </p>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={onStartTour}
          className="w-full py-2.5 text-[12px] font-medium bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-lg transition-colors"
        >
          Take the Tour
        </button>
        <button
          onClick={onSkip}
          className="w-full py-2.5 text-[12px] font-medium text-[var(--t-text-tertiary)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] rounded-lg transition-colors"
        >
          Skip & Start
        </button>
      </div>
    </div>
  )
}
