import { useState } from 'react'

interface AgentChatApiKeySetupProps {
  onSave: (key: string) => Promise<void>
}

export function AgentChatApiKeySetup({ onSave }: AgentChatApiKeySetupProps) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!key.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(key.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-md w-full p-6">
        <h2 className="text-lg font-medium text-[var(--t-text-primary)] mb-2">
          Set up Agent Chat
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          Enter your OpenAI API key to enable the agent chat. Your key is encrypted and stored locally.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-[var(--t-bg-surface)] text-[var(--t-text-primary)] border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--t-accent)] placeholder:text-zinc-600 mb-3"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        {error && (
          <p className="text-xs text-red-400 mb-3">{error}</p>
        )}
        <button
          onClick={handleSave}
          disabled={!key.trim() || saving}
          className="w-full px-4 py-2 text-sm rounded-lg bg-[var(--t-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save API Key'}
        </button>
      </div>
    </div>
  )
}
