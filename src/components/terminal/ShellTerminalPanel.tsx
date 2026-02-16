import { memo, useEffect } from 'react'
import { useShellTerminal } from '../../hooks/useShellTerminal'

interface ShellTerminalPanelProps {
  terminalId: string
  isActive: boolean
}

export const ShellTerminalPanel = memo(function ShellTerminalPanel({ terminalId, isActive }: ShellTerminalPanelProps) {
  const { containerRef, writeData } = useShellTerminal({ terminalId, isActive })

  useEffect(() => {
    const unsub = window.electronAPI.terminal.onData(({ id, data }) => {
      if (id === terminalId) writeData(data)
    })
    return unsub
  }, [terminalId, writeData])

  return (
    <div
      className="absolute inset-0"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
})
