import { useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'

interface EditorTabBarProps {
  dirtyFiles: Set<string>
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export function EditorTabBar({ dirtyFiles }: EditorTabBarProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const openFiles = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.openFiles ?? [] : []
  })
  const selectedFilePath = useProjectStore((s) => {
    const apId = s.activeProjectId
    return apId ? s.fileTreeCache.get(apId)?.selectedFilePath ?? null : null
  })
  const openFile = useProjectStore((s) => s.openFile)
  const closeFile = useProjectStore((s) => s.closeFile)

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation()
      if (activeProjectId) closeFile(activeProjectId, path)
    },
    [activeProjectId, closeFile],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, path: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault()
        if (activeProjectId) closeFile(activeProjectId, path)
      }
    },
    [activeProjectId, closeFile],
  )

  if (openFiles.length === 0) return null

  return (
    <div className="flex items-center h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] overflow-x-auto flex-shrink-0">
      {openFiles.map((path) => {
        const isActive = path === selectedFilePath
        const isDirty = dirtyFiles.has(path)
        return (
          <button
            key={path}
            onClick={() => activeProjectId && openFile(activeProjectId, path)}
            onMouseDown={(e) => handleMouseDown(e, path)}
            className={`group/tab relative flex items-center gap-1.5 px-3 h-full text-[12px] border-r border-[var(--t-border)] transition-colors min-w-0 flex-shrink-0 ${
              isActive
                ? 'bg-[var(--t-bg-base)] text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--t-bg-base-50)]'
            }`}
          >
            <span className="truncate max-w-40">{basename(path)}</span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 group-hover/tab:hidden" />
            )}
            <span
              onClick={(e) => handleClose(e, path)}
              className={`flex-shrink-0 p-0.5 rounded hover:bg-[var(--t-border)] transition-opacity ${
                isDirty ? 'hidden group-hover/tab:block' : 'opacity-0 group-hover/tab:opacity-100'
              }`}
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </span>
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500" />}
          </button>
        )
      })}
    </div>
  )
}
