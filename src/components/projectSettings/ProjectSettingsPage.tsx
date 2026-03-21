import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useProjectConfigStore } from '../../stores/projectConfigStore'
import { useUIStore } from '../../stores/uiStore'
import type { SetupScript } from '../../types'

interface ProjectSettingsPageProps {
  projectId: string
}

export function ProjectSettingsPage({ projectId }: ProjectSettingsPageProps) {
  const project = useProjectStore((s) => s.projects.get(projectId))
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
                      ? 'bg-violet-500 border-violet-500'
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
