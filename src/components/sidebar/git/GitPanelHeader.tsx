import { useState, useRef } from 'react'
import { useUIStore } from '../../../stores/uiStore'
import type { GitPanelViewMode } from '../../../types'

const VIEW_MODES: { mode: GitPanelViewMode; label: string; path: string }[] = [
  { mode: 'flat', label: 'Flat list', path: 'M2 3h12M2 7h12M2 11h12' },
  { mode: 'tree', label: 'Tree view', path: 'M2 2v12h2V8h4V6H4V2H2zm8 2h6M10 8h6M10 12h6' },
  { mode: 'grouped', label: 'Grouped by folder', path: 'M1 3h5l2 2h6v8H1V3zM3 7h10M3 10h10' },
]

interface GitPanelHeaderProps {
  gitBranch: string
  gitAhead: number
  gitBehind: number
  loading: string | null
  onFetchBranches: () => void
  onRefresh: () => void
  onPush: () => void
  onPull: () => void
  onStash: () => void
  onStashPop: () => void
}

export function GitPanelHeader({
  gitBranch, gitAhead, gitBehind, loading,
  onFetchBranches, onRefresh, onPush, onPull, onStash, onStashPop,
}: GitPanelHeaderProps) {
  const viewMode = useUIStore((s) => s.gitPanelViewMode)
  const setViewMode = useUIStore((s) => s.setGitPanelViewMode)

  const cycleViewMode = () => {
    const idx = VIEW_MODES.findIndex((v) => v.mode === viewMode)
    const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length]
    setViewMode(next.mode)
  }

  const currentView = VIEW_MODES.find((v) => v.mode === viewMode) ?? VIEW_MODES[0]

  return (
    <div className="flex flex-col border-b border-[var(--t-hairline)] flex-shrink-0">
      {gitBranch && (
        <div className="flex items-center gap-2 px-3 pt-1.5 pb-1 min-w-0">
          <Tooltip label="Switch branch">
            <button
              onClick={onFetchBranches}
              className="flex items-center gap-1 text-[11px] text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] truncate transition-[color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.96]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                <path d="M5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" opacity="0.6"/>
              </svg>
              <span className="truncate">{gitBranch}</span>
            </button>
          </Tooltip>
          {gitAhead > 0 && (
            <span className="text-[10px] text-[var(--t-text-muted)] tnum flex-shrink-0">↑{gitAhead}</span>
          )}
          {gitBehind > 0 && (
            <span className="text-[10px] text-[var(--t-text-muted)] tnum flex-shrink-0">↓{gitBehind}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-0.5 px-3 pb-1.5 pt-0.5">
        <Tooltip label={currentView.label}>
          <button
            onClick={cycleViewMode}
            className="text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] p-1 rounded hover:bg-[var(--t-bg-hover)] transition-[color,background-color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.92]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d={currentView.path} />
            </svg>
          </button>
        </Tooltip>
        <div className="w-px h-4 bg-[var(--t-hairline)] mx-0.5" />
        <IconButton onClick={onPush} label={`Push${gitAhead ? ` (${gitAhead})` : ''}`} disabled={loading === 'push'}>
          <path d="M8 12V4M5 6l3-3 3 3" />
        </IconButton>
        <IconButton onClick={onPull} label={`Pull${gitBehind ? ` (${gitBehind})` : ''}`} disabled={loading === 'pull'}>
          <path d="M8 4v8M5 10l3 3 3-3" />
        </IconButton>
        <IconButton onClick={onStash} label="Stash" disabled={loading === 'stash'}>
          <path d="M3 4h10M3 8h10M3 12h10" />
        </IconButton>
        <IconButton onClick={onStashPop} label="Pop stash" disabled={loading === 'stashPop'}>
          <path d="M3 6h10M3 10h10M8 2v4M6 4l2-2 2 2" />
        </IconButton>
        <IconButton onClick={onRefresh} label="Refresh">
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v4h-4" />
        </IconButton>
      </div>
    </div>
  )
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()

  const onEnter = () => {
    timeout.current = setTimeout(() => setShow(true), 400)
  }
  const onLeave = () => {
    clearTimeout(timeout.current)
    setShow(false)
  }

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-[11px] text-[var(--t-text-primary)] glass rounded whitespace-nowrap z-50 pointer-events-none animate-lift-in">
          {label}
        </div>
      )}
    </div>
  )
}

function IconButton({ onClick, label, disabled, children }: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="text-[var(--t-text-muted)] hover:text-[var(--t-text-primary)] p-1 rounded hover:bg-[var(--t-bg-hover)] transition-[color,background-color,transform] duration-[var(--t-dur-base)] ease-[var(--t-ease-out)] active:scale-[0.92] disabled:opacity-40 disabled:active:scale-100"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {children}
        </svg>
      </button>
    </Tooltip>
  )
}
