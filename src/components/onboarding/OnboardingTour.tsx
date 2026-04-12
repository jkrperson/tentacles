import { useEffect, useState, useCallback, useRef } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { TOUR_STEPS } from './tourSteps'

const PAD = 8 // padding around spotlight cutout

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

export function OnboardingTour() {
  const tourStepIndex = useOnboardingStore((s) => s.tourStepIndex)
  const nextTourStep = useOnboardingStore((s) => s.nextTourStep)
  const prevTourStep = useOnboardingStore((s) => s.prevTourStep)
  const endTour = useOnboardingStore((s) => s.endTour)

  const step = TOUR_STEPS[tourStepIndex]
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const rafRef = useRef<number>(0)

  const updateRect = useCallback(() => {
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.id}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    } else {
      setTargetRect(null)
    }
  }, [step])

  // Update rect on step change and on resize
  useEffect(() => {
    updateRect()

    const onResize = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateRect)
    }

    window.addEventListener('resize', onResize)
    const observer = new ResizeObserver(onResize)
    observer.observe(document.body)

    return () => {
      window.removeEventListener('resize', onResize)
      observer.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [updateRect])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        nextTourStep()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevTourStep()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        endTour()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nextTourStep, prevTourStep, endTour])

  if (!step) return null

  return (
    <div className="fixed inset-0 z-[9998] animate-onboarding-fade-in">
      {/* Spotlight overlay with cutout */}
      <SpotlightOverlay targetRect={targetRect} onClickBackdrop={endTour} />

      {/* Tooltip card */}
      <TourTooltip
        targetRect={targetRect}
        step={step}
        stepIndex={tourStepIndex}
        totalSteps={TOUR_STEPS.length}
        onNext={nextTourStep}
        onPrev={prevTourStep}
        onSkip={endTour}
      />
    </div>
  )
}

function SpotlightOverlay({
  targetRect,
  onClickBackdrop,
}: {
  targetRect: TargetRect | null
  onClickBackdrop: () => void
}) {
  if (!targetRect) {
    return (
      <div
        className="absolute inset-0 bg-black/50 transition-all duration-300"
        onClick={onClickBackdrop}
      />
    )
  }

  const x = targetRect.left - PAD
  const y = targetRect.top - PAD
  const w = targetRect.width + PAD * 2
  const h = targetRect.height + PAD * 2
  const vw = window.innerWidth
  const vh = window.innerHeight

  // SVG overlay with a transparent cutout (using evenodd fill rule)
  return (
    <svg
      className="absolute inset-0 w-full h-full transition-all duration-300"
      onClick={onClickBackdrop}
      style={{ pointerEvents: 'auto' }}
    >
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={6}
            fill="black"
            className="transition-all duration-300"
          />
        </mask>
      </defs>
      <rect
        width={vw}
        height={vh}
        fill="rgba(0,0,0,0.55)"
        mask="url(#spotlight-mask)"
      />
      {/* Highlight border around cutout */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill="none"
        stroke="var(--t-accent)"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        className="transition-all duration-300"
      />
    </svg>
  )
}

function TourTooltip({
  targetRect,
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: {
  targetRect: TargetRect | null
  step: (typeof TOUR_STEPS)[number]
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) {
      // Center on screen if no target
      setPos({
        top: window.innerHeight / 2 - 80,
        left: window.innerWidth / 2 - 160,
      })
      return
    }

    const tooltip = tooltipRef.current
    const tw = tooltip.offsetWidth
    const th = tooltip.offsetHeight
    const gap = 12
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = 0
    let left = 0

    const placement = step.placement

    if (placement === 'right') {
      top = targetRect.top + targetRect.height / 2 - th / 2
      left = targetRect.left + targetRect.width + PAD + gap
    } else if (placement === 'left') {
      top = targetRect.top + targetRect.height / 2 - th / 2
      left = targetRect.left - PAD - gap - tw
    } else if (placement === 'bottom') {
      top = targetRect.top + targetRect.height + PAD + gap
      left = targetRect.left + targetRect.width / 2 - tw / 2
    } else {
      top = targetRect.top - PAD - gap - th
      left = targetRect.left + targetRect.width / 2 - tw / 2
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, vh - th - 8))
    left = Math.max(8, Math.min(left, vw - tw - 8))

    setPos({ top, left })
  }, [targetRect, step.placement, stepIndex])

  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] w-[300px] bg-[var(--t-bg-elevated)] border border-[var(--t-border)] rounded-xl shadow-2xl p-5 transition-all duration-300"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Step counter */}
      <div className="text-[10px] font-medium text-[var(--t-accent)] mb-1.5">
        {stepIndex + 1} of {totalSteps}
      </div>

      {/* Title */}
      <h3 className="text-[14px] font-semibold text-[var(--t-text-primary)] mb-1.5">
        {step.title}
      </h3>

      {/* Description */}
      <p className="text-[12px] text-[var(--t-text-tertiary)] leading-relaxed mb-4">
        {step.description}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onSkip}
          className="text-[11px] text-[var(--t-text-tertiary)] hover:text-[var(--t-text-secondary)] transition-colors"
        >
          Skip tour
        </button>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              className="px-3 py-1.5 text-[11px] font-medium text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] rounded-lg transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onNext}
            className="px-4 py-1.5 text-[11px] font-medium bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] text-white rounded-lg transition-colors"
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1 mt-4">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === stepIndex ? 'bg-[var(--t-accent)]' : 'bg-zinc-600'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
