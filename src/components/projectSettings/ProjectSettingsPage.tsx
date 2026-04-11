import { useState, useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useProjectConfigStore } from '../../stores/projectConfigStore'
import { useUIStore } from '../../stores/uiStore'
import type { SetupScript } from '../../types'
import { PROJECT_COLORS } from '../../types'

interface ProjectSettingsPageProps {
  projectId: string
}

export function ProjectSettingsPage({ projectId }: ProjectSettingsPageProps) {
  const project = useProjectStore((s) => s.projects.get(projectId))
  const setProjectColor = useProjectStore((s) => s.setProjectColor)
  const setProjectIcon = useProjectStore((s) => s.setProjectIcon)
  const config = useProjectConfigStore((s) => s.configs.get(projectId))
  const loadConfig = useProjectConfigStore((s) => s.loadConfig)
  const saveConfig = useProjectConfigStore((s) => s.saveConfig)
  const openTerminalView = useUIStore((s) => s.openTerminalView)

  const [draftScripts, setDraftScripts] = useState<SetupScript[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadConfig(projectId)
  }, [projectId, loadConfig])

  useEffect(() => {
    if (config) {
      setDraftScripts(config.setupScripts.map((s) => ({ ...s })))
      setDirty(false)
    }
  }, [config])

  const handleAdd = useCallback(() => {
    setDraftScripts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), command: '', enabled: true },
    ])
    setDirty(true)
  }, [])

  const handleRemove = useCallback((id: string) => {
    setDraftScripts((prev) => prev.filter((s) => s.id !== id))
    setDirty(true)
  }, [])

  const handleToggle = useCallback((id: string) => {
    setDraftScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
    setDirty(true)
  }, [])

  const handleCommandChange = useCallback((id: string, command: string) => {
    setDraftScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, command } : s))
    )
    setDirty(true)
  }, [])

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return
    setDraftScripts((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setDirty(true)
  }, [])

  const handleMoveDown = useCallback((index: number) => {
    setDraftScripts((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await saveConfig(projectId, {
        projectPath: projectId,
        setupScripts: draftScripts,
      })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [projectId, draftScripts, saveConfig])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Project not found
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--t-bg-base)]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={openTerminalView}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Back"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.354 3.354a.5.5 0 0 0-.708-.708l-4.5 4.5a.5.5 0 0 0 0 .708l4.5 4.5a.5.5 0 0 0 .708-.708L6.207 8l4.147-4.146z"/>
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">{project.name}</h1>
              <p className="text-[11px] text-zinc-500 truncate" title={project.path}>{project.path}</p>
            </div>
          </div>
        </div>

        {/* Project Icon Customization */}
        <ProjectIconSection
          project={project}
          onColorChange={(color) => setProjectColor(projectId, color)}
          onIconChange={(icon) => setProjectIcon(projectId, icon)}
        />

        {/* Setup Scripts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
              Setup Scripts
            </h2>
            <p className="text-[10px] text-zinc-600">
              Run automatically when a worktree is created
            </p>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            {draftScripts.map((script, index) => (
              <div
                key={script.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--t-bg-surface)] border border-[var(--t-border)]"
              >
                {/* Enable/disable toggle */}
                <button
                  onClick={() => handleToggle(script.id)}
                  className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
                    script.enabled
                      ? 'bg-[var(--t-accent)] border-[var(--t-accent)]'
                      : 'border-zinc-600 hover:border-zinc-400'
                  }`}
                  title={script.enabled ? 'Disable' : 'Enable'}
                >
                  {script.enabled && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                      <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2.5-2.5a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </button>

                {/* Command input */}
                <input
                  type="text"
                  value={script.command}
                  onChange={(e) => handleCommandChange(script.id, e.target.value)}
                  placeholder="e.g. bun install"
                  className="flex-1 px-2 py-1 text-[12px] font-mono bg-transparent text-[var(--t-text-primary)] placeholder-[var(--t-text-faint)] outline-none border-none"
                />

                {/* Reorder buttons */}
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:hover:text-zinc-600 p-0.5 transition-colors"
                  title="Move up"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M7.646 4.646a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8 5.707 5.354 8.354a.5.5 0 11-.708-.708l3-3z"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === draftScripts.length - 1}
                  className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:hover:text-zinc-600 p-0.5 transition-colors"
                  title="Move down"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.354 11.354a.5.5 0 01-.708 0l-3-3a.5.5 0 01.708-.708L8 10.293l2.646-2.647a.5.5 0 01.708.708l-3 3z"/>
                  </svg>
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleRemove(script.id)}
                  className="text-zinc-600 hover:text-red-400 p-0.5 transition-colors"
                  title="Remove script"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                  </svg>
                </button>
              </div>
            ))}

            {draftScripts.length === 0 && (
              <div className="text-[12px] text-zinc-600 py-4 text-center border border-dashed border-[var(--t-border)] rounded-lg">
                No setup scripts configured
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
              </svg>
              Add script
            </button>

            <div className="flex-1" />

            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)] disabled:opacity-50 text-white text-[11px] font-medium rounded-md transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// --- Icon customization section ---

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff'
}

interface ProjectIconSectionProps {
  project: { name: string; color: string; icon?: string }
  onColorChange: (color: string) => void
  onIconChange: (icon: string) => void
}

function ProjectIconSection({ project, onColorChange, onIconChange }: ProjectIconSectionProps) {
  const [iconDraft, setIconDraft] = useState(project.icon ?? '')
  const [customColor, setCustomColor] = useState(project.color)
  const colorInputRef = useRef<HTMLInputElement>(null)

  // Sync when project changes externally
  useEffect(() => {
    setIconDraft(project.icon ?? '')
    setCustomColor(project.color)
  }, [project.icon, project.color])

  const displayIcon = iconDraft || project.name[0]?.toUpperCase() || '?'

  return (
    <section className="mb-8">
      <h2 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        Project Icon
      </h2>

      <div className="flex items-start gap-6">
        {/* Large preview */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-200 shadow-lg"
            style={{
              backgroundColor: project.color,
              color: getContrastColor(project.color),
            }}
          >
            {displayIcon}
          </div>
          <span className="text-[10px] text-zinc-600">Preview</span>
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-4">
          {/* Icon character */}
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1.5">
              Icon letter or emoji
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={iconDraft}
                onChange={(e) => {
                  // Allow 1-2 characters (for emoji which can be 2 chars)
                  const val = [...e.target.value].slice(0, 2).join('')
                  setIconDraft(val)
                }}
                onBlur={() => onIconChange(iconDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onIconChange(iconDraft)
                }}
                placeholder={project.name[0]?.toUpperCase() ?? '?'}
                className="w-16 px-2 py-1.5 text-center text-[14px] font-semibold bg-[var(--t-bg-surface)] border border-[var(--t-border)] text-[var(--t-text-primary)] placeholder-[var(--t-text-faint)] rounded-md outline-none focus:border-[var(--t-accent)]/50 transition-colors"
              />
              {iconDraft && (
                <button
                  onClick={() => { setIconDraft(''); onIconChange('') }}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1.5">
              Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange(color)}
                  className={`w-7 h-7 rounded-full transition-all duration-150 hover:scale-110 ${
                    project.color === color
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--t-bg-base)]'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              {/* Custom color via native picker */}
              <button
                onClick={() => colorInputRef.current?.click()}
                className={`w-7 h-7 rounded-full border-2 border-dashed border-zinc-600 hover:border-zinc-400 flex items-center justify-center transition-colors ${
                  !PROJECT_COLORS.includes(project.color as typeof PROJECT_COLORS[number])
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--t-bg-base)]'
                    : ''
                }`}
                style={
                  !PROJECT_COLORS.includes(project.color as typeof PROJECT_COLORS[number])
                    ? { backgroundColor: project.color, borderStyle: 'solid', borderColor: project.color }
                    : undefined
                }
                title="Custom color"
              >
                {PROJECT_COLORS.includes(project.color as typeof PROJECT_COLORS[number]) && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-500">
                    <path d="M12.433 3.1a1 1 0 0 1-.2 1.4L7.15 8.593l-.95 3.306a.5.5 0 0 1-.838.218L2.14 8.885a.5.5 0 0 1 .148-.862l3.233-1.164L9.633 2.3a1 1 0 0 1 1.4-.2l1.4 1z"/>
                  </svg>
                )}
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value)
                  onColorChange(e.target.value)
                }}
                className="sr-only"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
