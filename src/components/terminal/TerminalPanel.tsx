import { memo, useEffect } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { registerSessionWriter } from '../../dataRouter'

interface TerminalPanelProps {
  sessionId: string
  isActive: boolean
}

export const TerminalPanel = memo(function TerminalPanel({ sessionId, isActive }: TerminalPanelProps) {
  const { containerRef, writeData } = useTerminal({ sessionId, isActive })

  useEffect(() => {
    return registerSessionWriter(sessionId, writeData)
  }, [sessionId, writeData])

  return (
    <div
      className="absolute inset-0"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
})
