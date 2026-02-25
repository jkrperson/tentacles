import { useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'

interface EditorTabBarProps {
  dirtyFiles: Set<string>
  conflictedFiles: Set<string>
  onCloseTab: (path: string) => void
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export function EditorTabBar({ dirtyFiles, conflictedFiles, onCloseTab }: EditorTabBarProps) {
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

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation()
      onCloseTab(path)
    },
    [onCloseTab],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, path: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault()
        onCloseTab(path)
      }
    },
    [onCloseTab],
  )

  if (openFiles.length === 0) return null

  return (
    <div className="flex items-center h-9 bg-[var(--t-bg-surface)] border-b border-[var(--t-border)] overflow-x-auto flex-shrink-0">
      {openFiles.map((path) => {
        const isActive = path === selectedFilePath
        const isDirty = dirtyFiles.has(path)
        const isConflicted = conflictedFiles.has(path)
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
            {isConflicted ? (
              <span className="flex-shrink-0 text-amber-400 group-hover/tab:hidden" title="File changed on disk">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                </svg>
              </span>
            ) : isDirty ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 group-hover/tab:hidden" />
            ) : null}
            <span
              onClick={(e) => handleClose(e, path)}
              className={`flex-shrink-0 p-0.5 rounded hover:bg-[var(--t-border)] transition-opacity ${
                isDirty || isConflicted ? 'hidden group-hover/tab:block' : 'opacity-0 group-hover/tab:opacity-100'
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
